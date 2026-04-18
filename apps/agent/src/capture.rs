use scrap::{Capturer, Display};
use std::io::ErrorKind;
use std::time::Duration;

pub enum CaptureResult {
    Frame(Vec<u8>),
    NotReady,
    Reinit,
}

pub struct ScreenCapturer {
    capturer: Capturer,
    pub width: u32,
    pub height: u32,
}

impl ScreenCapturer {
    pub fn new() -> Self {
        let display = Display::primary().expect("Failed to find primary display");
        let width = display.width() as u32;
        let height = display.height() as u32;
        let capturer = Capturer::new(display).expect("Failed to create screen capturer");
        ScreenCapturer {
            capturer,
            width,
            height,
        }
    }

    pub fn try_capture(&mut self) -> CaptureResult {
        let expected_len = (self.width * self.height * 4) as usize;
        match self.capturer.frame() {
            Ok(frame) if frame.len() == expected_len => CaptureResult::Frame(frame.to_vec()),
            Ok(_) => {
                self.reinit();
                CaptureResult::Reinit
            }
            Err(ref e) if e.kind() == ErrorKind::WouldBlock => CaptureResult::NotReady,
            Err(_) => {
                self.reinit();
                CaptureResult::Reinit
            }
        }
    }

    fn reinit(&mut self) {
        std::thread::sleep(Duration::from_millis(150));
        loop {
            let display = Display::primary().expect("primary display not found");
            let w = display.width() as u32;
            let h = display.height() as u32;
            match Capturer::new(display) {
                Ok(c) => {
                    self.capturer = c;
                    self.width = w;
                    self.height = h;
                    std::thread::sleep(Duration::from_millis(100));
                    return;
                }
                Err(_) => std::thread::sleep(Duration::from_millis(250)),
            }
        }
    }
}
