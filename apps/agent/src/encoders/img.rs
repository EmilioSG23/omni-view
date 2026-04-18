use image::{DynamicImage, ImageBuffer, ImageOutputFormat, Rgb};
use std::io::Cursor;
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc,
};
use tokio::sync::mpsc;

use super::StreamEvent;

pub struct ImageEncoder {
    tx: mpsc::Sender<StreamEvent>,
    width: u32,
    height: u32,
    /// Dynamic quality — read on every frame write.
    quality: Arc<AtomicU8>,
    format: String,
}

impl ImageEncoder {
    pub fn new(
        width: u32,
        height: u32,
        quality: Arc<AtomicU8>,
        format: &str,
        tx: mpsc::Sender<StreamEvent>,
    ) -> Self {
        Self {
            tx,
            width,
            height,
            quality,
            format: format.to_owned(),
        }
    }
}

impl super::Encoder for ImageEncoder {
    fn write_frame(&mut self, frame: &[u8]) -> bool {
        let q = self.quality.load(Ordering::Relaxed);
        let encoded = encode(frame, self.width, self.height, q, &self.format);
        self.tx
            .blocking_send(StreamEvent::Frame(Arc::new(encoded)))
            .is_ok()
    }
}

pub fn encode(frame: &[u8], width: u32, height: u32, quality: u8, format: &str) -> Vec<u8> {
    let fmt = match format.to_lowercase().as_str() {
        "jpeg" | "jpg" => ImageOutputFormat::Jpeg(quality),
        "png" => ImageOutputFormat::Png,
        "webp" => ImageOutputFormat::WebP,
        "gif" => ImageOutputFormat::Gif,
        "tiff" => ImageOutputFormat::Tiff,
        "bmp" => ImageOutputFormat::Bmp,
        other => {
            eprintln!("[img] Unknown format '{}', falling back to JPEG", other);
            ImageOutputFormat::Jpeg(quality)
        }
    };
    encode_bgra(frame, width, height, fmt)
}

fn encode_bgra(frame: &[u8], width: u32, height: u32, fmt: ImageOutputFormat) -> Vec<u8> {
    let mut rgb = Vec::with_capacity((width * height * 3) as usize);
    for px in frame.chunks_exact(4) {
        rgb.push(px[2]); // R
        rgb.push(px[1]); // G
        rgb.push(px[0]); // B
    }
    let buf: ImageBuffer<Rgb<u8>, Vec<u8>> =
        ImageBuffer::from_raw(width, height, rgb).expect("buffer size mismatch");
    let mut cursor = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(buf)
        .write_to(&mut cursor, fmt)
        .expect("image encode failed");
    cursor.into_inner()
}
