use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, OnceLock};
use std::thread;
use tokio::sync::mpsc;

use super::StreamEvent;

static FFMPEG_PATH: OnceLock<PathBuf> = OnceLock::new();

impl super::Encoder for H264StreamEncoder {
    fn write_frame(&mut self, frame: &[u8]) -> bool {
        if self.tx.is_closed() {
            return false;
        }
        match self.stdin.as_mut() {
            Some(s) => s.write_all(frame).is_ok(),
            None => false,
        }
    }
}

pub(super) fn ffmpeg_path() -> &'static PathBuf {
    FFMPEG_PATH.get_or_init(|| {
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
}

pub struct H264StreamEncoder {
    stdin: Option<ChildStdin>,
    child: Child,
    tx: mpsc::Sender<StreamEvent>,
    pump_thread: Option<thread::JoinHandle<()>>,
}

impl H264StreamEncoder {
    pub fn start(
        width: u32,
        height: u32,
        fps: u32,
        quality: u8,
        tx: mpsc::Sender<StreamEvent>,
    ) -> Option<Self> {
        let size = format!("{}x{}", width, height);
        let fps_s = fps.to_string();
        let crf_s = (((100u32 - quality as u32) * 51) / 100).to_string();

        let mut cmd = Command::new(ffmpeg_path());
        cmd.args([
            // ── input ────────────────────────────────────────────────────
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
            // ── encode ───────────────────────────────────────────────────
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-tune",
            "zerolatency",
            // Baseline 4.0: broadest browser compatibility
            "-profile:v",
            "baseline",
            "-level:v",
            "4.0",
            // BGRA->yuv420p: baseline only supports 4:2:0
            "-pix_fmt",
            "yuv420p",
            "-crf",
            &crf_s,
            // One keyframe per frame -> every fragment is self-contained
            "-g",
            "1",
            "-sc_threshold",
            "0",
            // ── output ───────────────────────────────────────────────────
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
                eprintln!("[H264] Failed to spawn ffmpeg: {e}");
                return None;
            }
        };

        let stdout = child.stdout.take().expect("stdout is piped");
        let stdin = child.stdin.take().expect("stdin is piped");

        let tx_pump = tx.clone();
        let pump_thread = thread::spawn(move || {
            use std::io::Read;
            let mut reader = stdout;
            let mut buf = vec![0u8; 131_072]; // 128 KiB
            let mut is_init = true;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = StreamEvent::Frame(Arc::new(buf[..n].to_vec()));
                        if is_init {
                            is_init = false;
                            if tx_pump.blocking_send(data).is_err() {
                                break;
                            }
                        } else {
                            match tx_pump.try_send(data) {
                                Ok(_) => {}
                                Err(mpsc::error::TrySendError::Full(_)) => {} // intentional drop
                                Err(mpsc::error::TrySendError::Closed(_)) => break,
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        Some(Self {
            stdin: Some(stdin),
            child,
            tx,
            pump_thread: Some(pump_thread),
        })
    }
}

impl Drop for H264StreamEncoder {
    fn drop(&mut self) {
        drop(self.stdin.take());
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(handle) = self.pump_thread.take() {
            let _ = handle.join();
        }
    }
}
