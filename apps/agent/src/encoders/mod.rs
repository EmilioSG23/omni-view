mod h264;
mod img;
mod interface;
pub use interface::{Encoder, EncoderConfig, StreamEvent};

use crate::capture::{CaptureResult, ScreenCapturer};
use crate::consts::SessionControl;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

pub fn run_capture_loop(
    config: EncoderConfig,
    tx: mpsc::Sender<StreamEvent>,
    session: SessionControl,
) {
    let mut capturer = ScreenCapturer::new();
    let interval = Duration::from_secs_f64(1.0 / config.fps as f64);

    let mut encoder = match build_encoder(&config, capturer.width, capturer.height, tx.clone()) {
        Some(e) => e,
        None => {
            eprintln!("[encoder] Failed to start encoder — session dropped.");
            return;
        }
    };

    let mut next_tick = Instant::now() + interval;
    loop {
        if session.is_paused() {
            if tx.is_closed() {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
            next_tick = Instant::now() + interval;
            continue;
        }

        match poll_capture(&mut capturer) {
            CaptureResult::Frame(frame) => {
                if !encoder.write_frame(&frame) {
                    break; // client disconnected
                }
            }
            CaptureResult::Reinit => {
                let stable = match wait_for_stable_display(&mut capturer, &tx) {
                    Some(f) => f,
                    None => break, // client disconnected during transition
                };
                let (w, h) = (capturer.width, capturer.height);

                drop(encoder);

                let _ = tx.blocking_send(StreamEvent::Reinit);

                let mut new_enc = match build_encoder(&config, w, h, tx.clone()) {
                    Some(e) => e,
                    None => break,
                };
                if !new_enc.write_frame(&stable) {
                    break;
                }
                encoder = new_enc;
                next_tick = Instant::now() + interval;
                continue;
            }
            CaptureResult::NotReady => unreachable!(),
        }

        sleep_until(next_tick);
        next_tick += interval;
    }
}

fn build_encoder(
    config: &EncoderConfig,
    w: u32,
    h: u32,
    tx: mpsc::Sender<StreamEvent>,
) -> Option<Box<dyn Encoder>> {
    match config.encoder.to_lowercase().as_str() {
        "h264" => h264::H264StreamEncoder::start(w, h, config.fps, config.quality, tx)
            .map(|e| Box::new(e) as Box<dyn Encoder>),
        fmt => Some(
            Box::new(img::ImageEncoder::new(w, h, config.quality, fmt, tx)) as Box<dyn Encoder>,
        ),
    }
}

fn poll_capture(capturer: &mut ScreenCapturer) -> CaptureResult {
    loop {
        match capturer.try_capture() {
            CaptureResult::NotReady => std::thread::sleep(Duration::from_micros(500)),
            other => return other,
        }
    }
}

fn wait_for_stable_display(
    capturer: &mut ScreenCapturer,
    tx: &mpsc::Sender<StreamEvent>,
) -> Option<Vec<u8>> {
    const STABLE_FRAMES: usize = 4;

    let mut consecutive: usize = 0;

    loop {
        if tx.is_closed() {
            return None;
        }
        match capturer.try_capture() {
            CaptureResult::Frame(f) => {
                consecutive += 1;
                if consecutive >= STABLE_FRAMES {
                    return Some(f);
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            CaptureResult::NotReady => {
                std::thread::sleep(Duration::from_micros(500));
            }
            CaptureResult::Reinit => {
                consecutive = 0;
            }
        }
    }
}

fn sleep_until(deadline: Instant) {
    let now = Instant::now();
    if deadline > now {
        std::thread::sleep(deadline - now);
    }
}
