/// Integration tests for `SessionControl` and `SessionState`.
///
/// Both types are `pub` — accessible from this external test crate.
use omniview_agent::consts::{SessionControl, SessionState};

#[test]
fn session_control_initial_state_is_idle() {
    let sc = SessionControl::new(SessionState::Idle);
    assert_eq!(sc.get(), SessionState::Idle);
}

#[test]
fn session_control_set_returns_previous_state() {
    let sc = SessionControl::new(SessionState::Idle);
    let prev = sc.set(SessionState::Streaming);
    assert_eq!(prev, SessionState::Idle);
    assert_eq!(sc.get(), SessionState::Streaming);
}

#[test]
fn session_control_should_capture_only_when_streaming() {
    let sc = SessionControl::new(SessionState::Idle);
    assert!(!sc.should_capture());
    sc.set(SessionState::Streaming);
    assert!(sc.should_capture());
    sc.set(SessionState::Paused);
    assert!(!sc.should_capture());
}

#[test]
fn session_control_clone_shares_state() {
    let sc1 = SessionControl::new(SessionState::Idle);
    let sc2 = sc1.clone();
    sc1.set(SessionState::Streaming);
    assert_eq!(sc2.get(), SessionState::Streaming, "clone must share the same Arc");
}

#[test]
fn session_state_from_unknown_value_is_idle() {
    assert_eq!(SessionState::from(255u8), SessionState::Idle);
}

#[test]
fn session_state_display() {
    assert_eq!(format!("{}", SessionState::Idle),       "[IDLE]");
    assert_eq!(format!("{}", SessionState::Streaming),  "[STREAMING]");
    assert_eq!(format!("{}", SessionState::Paused),     "[PAUSED]");
    assert_eq!(format!("{}", SessionState::Connecting), "[CONNECTING]");
}
