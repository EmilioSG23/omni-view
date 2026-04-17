use image::{DynamicImage, ImageBuffer, Rgb};
use std::io::Cursor;

/// Encodes a raw BGRA frame into a JPEG byte vector.
///
/// * `frame`   – raw bytes in **BGRA** order (4 bytes per pixel)
/// * `width`   – frame width in pixels
/// * `height`  – frame height in pixels
/// * `quality` – JPEG quality (0 = worst, 100 = best)
pub fn encode(frame: &[u8], width: u32, height: u32, quality: u8) -> Vec<u8> {
    // Convert BGRA → RGB (drop alpha, swap B and R channels).
    let mut rgb = Vec::with_capacity((width * height * 3) as usize);
    for pixel in frame.chunks_exact(4) {
        // BGRA layout: pixel[0]=B, pixel[1]=G, pixel[2]=R, pixel[3]=A
        rgb.push(pixel[2]); // R
        rgb.push(pixel[1]); // G
        rgb.push(pixel[0]); // B
    }

    let buffer: ImageBuffer<Rgb<u8>, Vec<u8>> =
        ImageBuffer::from_raw(width, height, rgb).expect("Failed to build image buffer");

    let mut cursor = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(buffer)
        .write_to(&mut cursor, image::ImageOutputFormat::Jpeg(quality))
        .expect("Failed to JPEG-encode frame");

    cursor.into_inner()
}
