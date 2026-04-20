use std::io::Write;
use std::process::{Child, ChildStdin};
use std::thread;
use tokio::sync::mpsc;

use super::StreamEvent;
use crate::services::ffmpeg::{run_stdout_pump, spawn_ffmpeg};

pub struct H264StreamEncoder {
    stdin: Option<ChildStdin>,
    child: Child,
    tx: mpsc::Sender<StreamEvent>,
    pump_thread: Option<thread::JoinHandle<()>>,
}

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

impl H264StreamEncoder {
    pub fn start(
        width: u32,
        height: u32,
        fps: u32,
        quality: u8,
        tx: mpsc::Sender<StreamEvent>,
    ) -> Option<Self> {
        let (mut child, stdin, stdout) = spawn_ffmpeg(width, height, fps, quality)?;

        child.stdout.take();

        let pump_thread = thread::spawn({
            let tx = tx.clone();
            move || run_stdout_pump(stdout, tx)
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
