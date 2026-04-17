mod h264;
mod img;

use crate::capture::ScreenCapturer;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

/// Configuration for a single client encoder session.
pub struct EncoderConfig {
    pub encoder: String,
    pub fps: u32,
    pub quality: u8,
}

/// Run the capture + encode loop on the **current** blocking thread.
///
/// Captures frames from the primary display, encodes them per `config`, and
/// forwards byte chunks to `tx`. Returns when the channel closes (client
/// disconnected) or a fatal error occurs.
///
/// Call this inside `tokio::task::spawn_blocking`.
pub fn run_capture_loop(config: EncoderConfig, tx: mpsc::Sender<Vec<u8>>) {
    let mut capturer = ScreenCapturer::new();
    let (w, h) = (capturer.width, capturer.height);
    let interval = Duration::from_secs_f64(1.0 / config.fps as f64);

    match config.encoder.to_lowercase().as_str() {
        "h264" => run_h264(&mut capturer, w, h, config.fps, config.quality, interval, tx),
        enc => run_image(&mut capturer, w, h, config.quality, enc, interval, tx),
    }
}

// ── H.264 loop ────────────────────────────────────────────────────────────────

fn run_h264(
    capturer: &mut ScreenCapturer,
    width: u32,
    height: u32,
    fps: u32,
    quality: u8,
    interval: Duration,
    tx: mpsc::Sender<Vec<u8>>,
) {
    let mut enc = match h264::H264StreamEncoder::start(width, height, fps, quality, tx) {
        Some(e) => e,
        None => {
            eprintln!("[H264] Failed to start encoder — session dropped.");
            return;
        }
    };

    // Fixed-rate scheduler: advance next_tick by a fixed interval every
    // iteration so timing errors don't accumulate (unlike fixed-period sleep).
    let mut next_tick = Instant::now() + interval;
    loop {
        let frame = next_frame(capturer);
        if !enc.write_frame(&frame) {
            break; // ffmpeg exited or channel closed
        }
        sleep_until(next_tick);
        next_tick += interval;
    }
}

// ── Image-format loop ─────────────────────────────────────────────────────────

fn run_image(
    capturer: &mut ScreenCapturer,
    width: u32,
    height: u32,
    quality: u8,
    format: &str,
    interval: Duration,
    tx: mpsc::Sender<Vec<u8>>,
) {
    let mut next_tick = Instant::now() + interval;
    loop {
        let frame = next_frame(capturer);
        let encoded = img::encode(&frame, width, height, quality, format);
        if tx.blocking_send(encoded).is_err() {
            break; // channel closed → client gone
        }
        sleep_until(next_tick);
        next_tick += interval;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Spins (with a short yield) until the capturer returns a frame.
fn next_frame(capturer: &mut ScreenCapturer) -> Vec<u8> {
    loop {
        if let Some(f) = capturer.try_capture() {
            return f;
        }
        // Sub-millisecond yield avoids burning 100 % CPU while still catching
        // the next frame quickly (scrap surfaces new frames at display rate).
        std::thread::sleep(Duration::from_micros(500));
    }
}

/// Sleeps until `deadline`. No-op if already past.
fn sleep_until(deadline: Instant) {
    let now = Instant::now();
    if deadline > now {
        std::thread::sleep(deadline - now);
    }
}
