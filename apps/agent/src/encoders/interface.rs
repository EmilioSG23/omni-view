use std::sync::{
    atomic::{AtomicU32, AtomicU8},
    Arc,
};

/// A single event emitted by the capture/encode pipeline.
#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// An encoded video frame. Wrapped in Arc for cheap broadcast cloning.
    Frame(Arc<Vec<u8>>),
    /// The display was re-initialised (resolution change, monitor swap, etc.).
    Reinit,
}

pub trait Encoder: Send {
    fn write_frame(&mut self, frame: &[u8]) -> bool;
}

/// Runtime-configurable encoding parameters.
/// Stored as atomics so clients can update quality without restarting the pipeline.
pub struct EncoderConfig {
    pub encoder: String,
    /// Target frames per second. Updated atomically.
    pub fps: Arc<AtomicU32>,
    /// JPEG quality 1–100. Updated atomically.
    pub quality: Arc<AtomicU8>,
}
