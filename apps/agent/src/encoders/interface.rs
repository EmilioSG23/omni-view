use std::sync::{
    atomic::{AtomicU32, AtomicU8},
    Arc,
};

#[derive(Debug, Clone)]
pub enum StreamEvent {
    Init(Arc<Vec<u8>>),
    Frame(Arc<Vec<u8>>),
    Reinit,
}

pub trait Encoder: Send {
    fn write_frame(&mut self, frame: &[u8]) -> bool;
}

pub struct EncoderConfig {
    pub encoder: String,
    pub fps: Arc<AtomicU32>,
    pub quality: Arc<AtomicU8>,
}
