/// Integration tests for `encoders::img::encode`.
///
/// `encode` is `pub` — accessible from this external test crate.
/// These tests verify the BGRA → JPEG/PNG/WebP transformation without
/// any OS or hardware dependency.
use omniview_agent::encoders::img::encode;

fn solid_bgra(width: u32, height: u32, b: u8, g: u8, r: u8) -> Vec<u8> {
    let n = (width * height) as usize;
    let mut buf = Vec::with_capacity(n * 4);
    for _ in 0..n {
        buf.extend_from_slice(&[b, g, r, 0xFF]);
    }
    buf
}

#[test]
fn encode_jpeg_starts_with_jpeg_magic() {
    let frame = solid_bgra(4, 4, 0, 128, 255);
    let out = encode(&frame, 4, 4, 80, "jpeg");
    assert!(out.starts_with(&[0xFF, 0xD8]), "Expected JPEG SOI marker (FF D8)");
}

#[test]
fn encode_jpg_alias_produces_jpeg() {
    let frame = solid_bgra(4, 4, 0, 0, 0);
    let out = encode(&frame, 4, 4, 80, "jpg");
    assert!(out.starts_with(&[0xFF, 0xD8]));
}

#[test]
fn encode_png_starts_with_png_magic() {
    let frame = solid_bgra(4, 4, 255, 0, 0);
    let out = encode(&frame, 4, 4, 80, "png");
    assert!(out.starts_with(&[0x89, b'P', b'N', b'G']), "Expected PNG signature");
}

#[test]
fn jpeg_lower_quality_produces_smaller_output() {
    let frame = solid_bgra(16, 16, 100, 150, 200);
    let high = encode(&frame, 16, 16, 90, "jpeg");
    let low  = encode(&frame, 16, 16, 10, "jpeg");
    assert!(
        low.len() <= high.len(),
        "quality=10 ({} B) should not exceed quality=90 ({} B)",
        low.len(), high.len()
    );
}

#[test]
fn encode_webp_is_non_empty() {
    let frame = solid_bgra(4, 4, 0, 255, 0);
    assert!(!encode(&frame, 4, 4, 80, "webp").is_empty());
}

#[test]
fn encode_bmp_is_non_empty() {
    let frame = solid_bgra(4, 4, 0, 0, 255);
    assert!(!encode(&frame, 4, 4, 80, "bmp").is_empty());
}

#[test]
fn encode_unknown_format_falls_back_to_jpeg() {
    let frame = solid_bgra(4, 4, 50, 50, 50);
    let out = encode(&frame, 4, 4, 80, "unknown_fmt");
    assert!(out.starts_with(&[0xFF, 0xD8]), "Unknown format should fall back to JPEG");
}
