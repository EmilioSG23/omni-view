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

pub(crate) fn run_stdout_pump(stdout: ChildStdout, tx: mpsc::Sender<StreamEvent>) {
    use std::io::Read;
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

fn find_box(buf: &[u8], fourcc: &[u8; 4]) -> Option<usize> {
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
