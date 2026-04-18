use image::{DynamicImage, ImageBuffer, ImageOutputFormat, Rgb};
use std::io::Cursor;
use tokio::sync::mpsc;

/// An encoder that compresses each BGRA frame to an image format (JPEG, PNG,
/// WebP, …) and forwards the resulting bytes to `tx`.
pub struct ImageEncoder {
    tx: mpsc::Sender<Vec<u8>>,
    width: u32,
    height: u32,
    quality: u8,
    format: String,
}

impl ImageEncoder {
    pub fn new(
        width: u32,
        height: u32,
        quality: u8,
        format: &str,
        tx: mpsc::Sender<Vec<u8>>,
    ) -> Self {
        Self { tx, width, height, quality, format: format.to_owned() }
    }
}

impl super::Encoder for ImageEncoder {
    fn write_frame(&mut self, frame: &[u8]) -> bool {
        let encoded = encode(frame, self.width, self.height, self.quality, &self.format);
        self.tx.blocking_send(encoded).is_ok()
    }
}

/// Encodes a single raw BGRA frame to the named image format.
/// Supported names: `jpeg`/`jpg`, `png`, `webp`, `gif`, `tiff`, `bmp`.
/// Falls back to JPEG for unknown names.
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

/// Converts BGRA → RGB and encodes to the given `ImageOutputFormat`.
fn encode_bgra(frame: &[u8], width: u32, height: u32, fmt: ImageOutputFormat) -> Vec<u8> {
    let mut rgb = Vec::with_capacity((width * height * 3) as usize);
    for px in frame.chunks_exact(4) {
        // BGRA layout: px[0]=B px[1]=G px[2]=R px[3]=A
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
