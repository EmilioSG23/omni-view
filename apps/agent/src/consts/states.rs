use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum SessionState {
    Idle = 0,
    Connecting = 1,
    Streaming = 2,
    Paused = 3,
}

impl From<u8> for SessionState {
    fn from(v: u8) -> Self {
        match v {
            1 => Self::Connecting,
            2 => Self::Streaming,
            3 => Self::Paused,
            _ => Self::Idle,
        }
    }
}

impl std::fmt::Display for SessionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let label = match self {
            Self::Idle => "IDLE",
            Self::Connecting => "CONNECTING",
            Self::Streaming => "STREAMING",
            Self::Paused => "PAUSED",
        };
        write!(f, "[{label}]")
    }
}

#[derive(Clone)]
pub struct SessionControl {
    state: Arc<AtomicU8>,
}

impl SessionControl {
    pub fn new(initial: SessionState) -> Self {
        Self {
            state: Arc::new(AtomicU8::new(initial as u8)),
        }
    }

    pub fn set(&self, state: SessionState) -> SessionState {
        SessionState::from(self.state.swap(state as u8, Ordering::Release))
    }

    pub fn get(&self) -> SessionState {
        SessionState::from(self.state.load(Ordering::Acquire))
    }

    pub fn should_capture(&self) -> bool {
        self.get() == SessionState::Streaming
    }
}
