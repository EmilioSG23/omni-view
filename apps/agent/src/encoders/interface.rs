/// Encoder interface and session configuration for the `encoders` module.
///
/// This file holds the `Encoder` trait and the `EncoderConfig` struct so
/// they can serve as a stable interface for other modules and for testing.
pub trait Encoder: Send {
    /// Encodes a single raw BGRA frame and forwards the resulting bytes.
    /// Returns `false` when the downstream consumer is gone and the capture
    /// loop should stop.
    fn write_frame(&mut self, frame: &[u8]) -> bool;
}

/// Configuration for a single client encoder session.
pub struct EncoderConfig {
    pub encoder: String,
    pub fps: u32,
    pub quality: u8,
}
