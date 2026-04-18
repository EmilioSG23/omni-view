use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::OnceLock;
use std::thread;
use tokio::sync::mpsc;

static FFMPEG_PATH: OnceLock<PathBuf> = OnceLock::new();

// ── H264StreamEncoder ────────────────────────────────────────────────────────
// — Encodes a stream of raw BGRA frames to fragmented MP4 / H.264 using ffmpeg.
impl super::Encoder for H264StreamEncoder {
    /// Write one raw BGRA frame into the encoder.
    /// Returns `false` if the stdin pipe is broken (ffmpeg has exited).
    fn write_frame(&mut self, frame: &[u8]) -> bool {
        match self.stdin.as_mut() {
            Some(s) => s.write_all(frame).is_ok(),
            None => false,
        }
    }
}

/// Returns the cached path to the ffmpeg binary, resolved once on first call.
///
/// Resolution order:
/// 1. Walk ancestor dirs of the running executable for `vendor/ffmpeg/ffmpeg(.exe)`.
/// 2. Fall back to `ffmpeg` on the system PATH.
pub(super) fn ffmpeg_path() -> &'static PathBuf {
    FFMPEG_PATH.get_or_init(|| {
        let bin = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
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
}

/// A persistent ffmpeg process that encodes a continuous stream of raw BGRA
/// frames into fragmented MP4 / H.264.
///
/// One I-frame fragment is produced per input frame (`-g 1`) so every chunk
/// forwarded over WebSocket can be decoded independently by the browser's
/// MediaSource API with minimal latency.
///
/// # Lifecycle
/// 1. [`H264StreamEncoder::start`] — ffmpeg spawns, stdout pump thread begins.
/// 2. [`H264StreamEncoder::write_frame`] for every BGRA frame.
/// 3. Drop — stdin closes, ffmpeg flushes, pump exits, child is reaped.
pub struct H264StreamEncoder {
    stdin: Option<ChildStdin>,
    child: Child,
}

impl H264StreamEncoder {
    /// Spawn ffmpeg and begin streaming. Stdout chunks are forwarded to `tx`
    /// from a background thread. Returns `None` if ffmpeg could not be started.
    pub fn start(
        width: u32,
        height: u32,
        fps: u32,
        quality: u8,
        tx: mpsc::Sender<Vec<u8>>,
    ) -> Option<Self> {
        let size = format!("{}x{}", width, height);
        let fps_s = fps.to_string();
        // Map quality (1–100, higher = better) → CRF (51–0, lower = better).
        let crf_s = (((100u32 - quality as u32) * 51) / 100).to_string();

        let mut cmd = Command::new(ffmpeg_path());
        cmd.args([
            // ── input ────────────────────────────────────────────────────
            "-f", "rawvideo",
            "-pixel_format", "bgra",
            "-video_size", &size,
            "-framerate", &fps_s,
            "-i", "pipe:0",
            // ── encode ───────────────────────────────────────────────────
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-tune", "zerolatency",
            // Baseline 4.0: broadest browser compatibility (≤1920×1080@30fps)
            "-profile:v", "baseline",
            "-level:v", "4.0",
            // BGRA→yuv420p: baseline only supports 4:2:0
            "-pix_fmt", "yuv420p",
            "-crf", &crf_s,
            // One keyframe per frame → every fragment is self-contained
            "-g", "1",
            "-sc_threshold", "0",
            // ── output ───────────────────────────────────────────────────
            // Fragmented MP4 with empty init segment — required for MSE
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1",
        ]);

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[H264] Failed to spawn ffmpeg: {e}");
                return None;
            }
        };

        let stdout = child.stdout.take().expect("stdout is piped");
        let stdin = child.stdin.take().expect("stdin is piped");

        // Pump ffmpeg stdout → WebSocket channel on a dedicated thread so we
        // never block the capture loop.
        thread::spawn(move || {
            use std::io::Read;
            let mut reader = stdout;
            let mut buf = vec![0u8; 131_072]; // 128 KiB — fits a typical H.264 I-frame
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.blocking_send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        Some(Self { stdin: Some(stdin), child })
    }

}

impl Drop for H264StreamEncoder {
    fn drop(&mut self) {
        // Close stdin → ffmpeg flushes remaining output and exits.
        drop(self.stdin.take());
        // Kill in case it's still running, then reap to avoid OS resource leaks.
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
