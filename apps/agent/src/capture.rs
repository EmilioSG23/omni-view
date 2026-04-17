use scrap::{Capturer, Display};
use std::io::ErrorKind;

/// Wraps a `scrap::Capturer` and exposes the display dimensions.
pub struct ScreenCapturer {
    capturer: Capturer,
    pub width: u32,
    pub height: u32,
}

impl ScreenCapturer {
    /// Creates a capturer for the primary display.
    pub fn new() -> Self {
        let display = Display::primary().expect("Failed to find primary display");
        let width = display.width() as u32;
        let height = display.height() as u32;
        let capturer = Capturer::new(display).expect("Failed to create screen capturer");
        ScreenCapturer { capturer, width, height }
    }

    /// Tries to capture one frame.
    ///
    /// Returns `Some(raw_bytes)` on success, `None` when the frame is not yet
    /// ready (`WouldBlock`). Any other error is logged and treated as `None`.
    ///
    /// Frame format: **BGRA** (4 bytes per pixel) on Windows and macOS.
    pub fn try_capture(&mut self) -> Option<Vec<u8>> {
        match self.capturer.frame() {
            Ok(frame) => Some(frame.to_vec()),
            Err(ref e) if e.kind() == ErrorKind::WouldBlock => None,
            Err(e) => {
                eprintln!("Capture error: {e}");
                None
            }
        }
    }
}
