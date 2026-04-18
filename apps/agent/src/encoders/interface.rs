#[derive(Debug)]
pub enum StreamEvent {
    Frame(Vec<u8>),
    Reinit,
}

pub trait Encoder: Send {
    fn write_frame(&mut self, frame: &[u8]) -> bool;
}

pub struct EncoderConfig {
    pub encoder: String,
    pub fps: u32,
    pub quality: u8,
}
