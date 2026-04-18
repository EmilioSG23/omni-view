mod h264;
mod img;
mod interface;
pub use interface::{Encoder, EncoderConfig};

use crate::capture::ScreenCapturer;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

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

    let mut encoder: Box<dyn Encoder> = match config.encoder.to_lowercase().as_str() {
        "h264" => match h264::H264StreamEncoder::start(w, h, config.fps, config.quality, tx) {
            Some(enc) => Box::new(enc),
            None => {
                eprintln!("[H264] Failed to start encoder — session dropped.");
                return;
            }
        },
        fmt => Box::new(img::ImageEncoder::new(w, h, config.quality, fmt, tx)),
    };

    // Fixed-rate scheduler: advance next_tick by a fixed interval every
    // iteration so timing errors don't accumulate (unlike fixed-period sleep).
    let mut next_tick = Instant::now() + interval;
    loop {
        let frame = next_frame(&mut capturer);
        if !encoder.write_frame(&frame) {
            break;
        }
        sleep_until(next_tick);
        next_tick += interval;
    }
}

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
