use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, OnceLock};

use tokio::sync::mpsc;

use crate::encoders::StreamEvent;

static FFMPEG_PATH: OnceLock<PathBuf> = OnceLock::new();

pub(crate) fn ffmpeg_path() -> &'static Path {
    FFMPEG_PATH
        .get_or_init(|| {
            let bin = if cfg!(windows) {
                "ffmpeg.exe"
            } else {
                "ffmpeg"
            };
            if let Ok(exe) = std::env::current_exe() {
                let mut dir = exe.parent().map(|p| p.to_path_buf());
                while let Some(d) = dir {
                    let candidate = d.join("vendor").join("ffmpeg").join(bin);
                    if candidate.exists() {
                        return candidate;
                    }
                    dir = d.parent().map(|p| p.to_path_buf());
                }
            }
            PathBuf::from("ffmpeg")
        })
        .as_path()
}

pub(crate) fn spawn_ffmpeg(
    width: u32,
    height: u32,
    fps: u32,
    quality: u8,
) -> Option<(Child, ChildStdin, ChildStdout)> {
    let size = format!("{width}x{height}");
    let fps_s = fps.to_string();
    let crf_s = (((100u32 - quality as u32) * 51) / 100).to_string();

    let mut cmd = Command::new(ffmpeg_path());
    cmd.args([
        // ── input ────────────────────────────────────────────────────────────
        "-f",
        "rawvideo",
        "-pixel_format",
        "bgra",
        "-video_size",
        &size,
        "-framerate",
        &fps_s,
        "-i",
        "pipe:0",
        // ── encode ───────────────────────────────────────────────────────────
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
        // Baseline 4.0 — broadest browser compatibility
        "-profile:v",
        "baseline",
        "-level:v",
        "4.0",
        // BGRA → yuv420p: baseline only supports 4:2:0
        "-pix_fmt",
        "yuv420p",
        "-crf",
        &crf_s,
        // One keyframe per frame → every fragment is independently decodable
        "-g",
        "1",
        "-sc_threshold",
        "0",
        // ── output ───────────────────────────────────────────────────────────
        // Fragmented MP4 with empty init segment — required for MSE
        "-f",
        "mp4",
        "-movflags",
        "frag_keyframe+empty_moov+default_base_moof",
        "pipe:1",
    ]);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[ffmpeg] Failed to spawn ffmpeg: {e}");
            return None;
        }
    };

    let stdin = child.stdin.take().expect("stdin is piped");
    let stdout = child.stdout.take().expect("stdout is piped");
    Some((child, stdin, stdout))
}

pub(crate) fn run_stdout_pump(stdout: impl Read + Send + 'static, tx: mpsc::Sender<StreamEvent>) {
    let mut reader = stdout;
    let mut buf = vec![0u8; 131_072];

    let mut init_buf: Vec<u8> = Vec::new();
    let mut init_done = false;

    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if init_done {
                    send_frame(&tx, &buf[..n]);
                } else {
                    init_buf.extend_from_slice(&buf[..n]);
                    if let Some(moof_pos) = find_box(&init_buf, b"moof") {
                        init_done = true;
                        let init = StreamEvent::Init(Arc::new(init_buf[..moof_pos].to_vec()));
                        if tx.blocking_send(init).is_err() {
                            break;
                        }
                        if moof_pos < init_buf.len() {
                            send_frame(&tx, &init_buf[moof_pos..]);
                        }
                        drop(init_buf);
                        init_buf = Vec::new();
                    }
                }
            }
            Err(_) => break,
        }
    }
}

#[inline]
fn send_frame(tx: &mpsc::Sender<StreamEvent>, data: &[u8]) {
    let event = StreamEvent::Frame(Arc::new(data.to_vec()));
    match tx.try_send(event) {
        Ok(_) | Err(mpsc::error::TrySendError::Full(_)) => {}
        Err(mpsc::error::TrySendError::Closed(_)) => {}
    }
}

pub(crate) fn find_box(buf: &[u8], fourcc: &[u8; 4]) -> Option<usize> {
    let mut pos = 0usize;
    while pos + 8 <= buf.len() {
        let size =
            u32::from_be_bytes([buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]]) as usize;
        if &buf[pos + 4..pos + 8] == fourcc {
            return Some(pos);
        }
        if size < 8 {
            break;
        }
        pos += size;
    }
    None
}

// ---------------------------------------------------------------------------
// Unit tests — kept inline because find_box and run_stdout_pump are pub(crate)
// and therefore invisible to crates in tests/
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::thread;

    /// Build a minimal 8-byte MP4 box header: 4-byte big-endian size + 4-byte fourcc.
    fn box_header(size: u32, fourcc: &[u8; 4]) -> Vec<u8> {
        let mut v = size.to_be_bytes().to_vec();
        v.extend_from_slice(fourcc);
        v
    }

    /// Minimal fMP4 stream: ftyp box (24 bytes) + moof header + payload.
    fn fake_fmp4() -> Vec<u8> {
        let mut data = box_header(24, b"ftyp");
        data.extend_from_slice(&[0u8; 16]); // pad to declared size=24
        data.extend(box_header(16, b"moof"));
        data.extend_from_slice(&[0xAB, 0xCD, 0xEF, 0x00, 0x11, 0x22, 0x33, 0x44]);
        data
    }

    #[test]
    fn find_box_detects_moof_at_offset_zero() {
        let buf = box_header(16, b"moof");
        assert_eq!(find_box(&buf, b"moof"), Some(0));
    }

    #[test]
    fn find_box_detects_moof_after_ftyp() {
        let mut buf = box_header(24, b"ftyp");
        buf.extend_from_slice(&[0u8; 16]);
        buf.extend(box_header(16, b"moof"));
        assert_eq!(find_box(&buf, b"moof"), Some(24));
    }

    #[test]
    fn find_box_returns_none_when_fourcc_absent() {
        let buf = box_header(16, b"ftyp");
        assert_eq!(find_box(&buf, b"moof"), None);
    }

    #[test]
    fn find_box_returns_none_on_empty_input() {
        assert_eq!(find_box(&[], b"moof"), None);
    }

    #[test]
    fn find_box_breaks_on_size_less_than_8() {
        // size=4 is invalid; the loop must break before reaching "moof"
        let mut full = [0u8, 0, 0, 4, b'f', b't', b'y', b'p'].to_vec();
        full.extend(box_header(8, b"moof"));
        assert_eq!(find_box(&full, b"moof"), None);
    }

    #[test]
    fn run_stdout_pump_emits_init_then_frame() {
        let (tx, mut rx) = mpsc::channel::<StreamEvent>(32);
        thread::spawn(move || run_stdout_pump(Cursor::new(fake_fmp4()), tx));

        // First event must be Init containing the bytes before moof (the ftyp box, 24 bytes)
        let first = rx.blocking_recv().expect("expected Init event");
        assert!(matches!(first, StreamEvent::Init(_)), "Expected Init, got {:?}", first);
        if let StreamEvent::Init(ref data) = first {
            assert_eq!(data.len(), 24, "Init payload should be the ftyp box (24 bytes)");
        }
    }

    #[test]
    fn run_stdout_pump_handles_empty_reader() {
        let (tx, mut rx) = mpsc::channel::<StreamEvent>(4);
        thread::spawn(move || run_stdout_pump(Cursor::new(vec![]), tx));
        assert!(rx.blocking_recv().is_none(), "No events expected from empty reader");
    }

    #[test]
    fn run_stdout_pump_no_init_when_moof_absent() {
        // Bytes with no moof box — pump drains the reader and closes tx without emitting Init
        let mut data = box_header(16, b"ftyp");
        data.extend_from_slice(&[0u8; 8]);
        let (tx, mut rx) = mpsc::channel::<StreamEvent>(4);
        thread::spawn(move || run_stdout_pump(Cursor::new(data), tx));
        assert!(rx.blocking_recv().is_none(), "No Init when moof is absent");
    }
}

