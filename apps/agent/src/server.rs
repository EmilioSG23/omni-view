use std::net::SocketAddr;
use std::sync::{
    atomic::{AtomicU32, AtomicU8, AtomicUsize, Ordering},
    Arc,
};

use crate::consts::{SessionControl, SessionState};
use crate::config::interface::Config as ServerConfig;
use crate::encoders::{run_capture_loop, EncoderConfig, StreamEvent};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::{accept_async, tungstenite::Message};

pub async fn start_server(config: ServerConfig) {
    start_server_with_injected(config, None).await;
}

/// Like [`start_server`] but accepts an optional `broadcast::Sender<StreamEvent>` whose
/// messages are forwarded directly to connected clients.  When `Some` is supplied the
/// real screen-capture loop is **not** started, making this safe to call in tests
/// without a display or screen-capture permissions.
pub async fn start_server_with_injected(
    config: ServerConfig,
    frame_source: Option<broadcast::Sender<StreamEvent>>,
) {
    let listener = TcpListener::bind(&config.bind_addr)
        .await
        .unwrap_or_else(|e| panic!("Failed to bind to {}: {e}", config.bind_addr));

    println!("OmniView Agent ready");
    println!("  WebSocket : ws://{}", config.bind_addr);
    println!("  Agent ID  : {}", config.agent_id);
    println!("  Encoder   : {}", config.encoder);
		println!("  FPS       : {}", config.fps);
		println!("  Quality   : {}", config.quality);
    println!("\n[IDLE] No clients — capture paused.");

    let fps = Arc::new(AtomicU32::new(config.fps));
    let quality = Arc::new(AtomicU8::new(config.quality));

    let client_count = Arc::new(AtomicUsize::new(0));
    let session = SessionControl::new(SessionState::Idle);

    let (bcast_tx, _initial_rx) = broadcast::channel::<StreamEvent>(16);

    match frame_source {
        None => {
            // Production path: start the real screen-capture loop.
            let (mpsc_tx, mut mpsc_rx) = mpsc::channel::<StreamEvent>(4);
            let session_capture = session.clone();
            let enc_config = EncoderConfig {
                encoder: config.encoder.clone(),
                fps: fps.clone(),
                quality: quality.clone(),
            };
            tokio::task::spawn_blocking(move || {
                run_capture_loop(enc_config, mpsc_tx, session_capture);
            });
            let bcast_tx_fanout = bcast_tx.clone();
            tokio::spawn(async move {
                while let Some(event) = mpsc_rx.recv().await {
                    let _ = bcast_tx_fanout.send(event);
                }
            });
        }
        Some(injected_tx) => {
            // Test / injected path: subscribe to the caller-supplied sender and fan
            // its events into the internal broadcast channel.  No capture loop is
            // spawned, so this path has zero platform / display dependencies.
            let bcast_tx_fanout = bcast_tx.clone();
            let mut injected_rx = injected_tx.subscribe();
            tokio::spawn(async move {
                while let Ok(event) = injected_rx.recv().await {
                    let _ = bcast_tx_fanout.send(event);
                }
            });
        }
    }

    let password_hash = Arc::new(config.password_hash);
    let agent_id = Arc::new(config.agent_id);

    loop {
        let (stream, addr) = match listener.accept().await {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Accept error: {e}");
                continue;
            }
        };

        let frame_rx = bcast_tx.subscribe();
        tokio::spawn(handle_client(
            stream,
            addr,
            frame_rx,
            client_count.clone(),
            session.clone(),
            fps.clone(),
            quality.clone(),
            password_hash.clone(),
            agent_id.clone(),
        ));
    }
}

async fn handle_client(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    mut frame_rx: broadcast::Receiver<StreamEvent>,
    client_count: Arc<AtomicUsize>,
    session: SessionControl,
    fps: Arc<AtomicU32>,
    quality: Arc<AtomicU8>,
    password_hash: Arc<String>,
    agent_id: Arc<String>,
) {
    println!("[CONNECTING] Incoming connection from {addr}");

    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[ERROR] WebSocket handshake failed from {addr}: {e}");
            return;
        }
    };
    let (mut sender, mut receiver) = ws.split();

    let authenticated = 'auth: loop {
        match receiver.next().await {
            Some(Ok(Message::Text(text))) => {
                let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) else {
                    break 'auth false;
                };
                if msg["type"] != "auth" {
                    break 'auth false;
                }
                let password = msg["password"].as_str().unwrap_or("");
                if crate::config::hash_password(password) == *password_hash {
                    let ok = serde_json::json!({
                        "type": "auth_ok",
                        "agent_id": *agent_id,
                    });
                    let _ = sender.send(Message::Text(ok.to_string())).await;
                    break 'auth true;
                } else {
                    let err = serde_json::json!({
                        "type": "auth_error",
                        "reason": "invalid_password",
                    });
                    let _ = sender.send(Message::Text(err.to_string())).await;
                    break 'auth false;
                }
            }
            _ => break 'auth false,
        }
    };

    if !authenticated {
        println!("[AUTH] Rejected client from {addr}");
        return;
    }

    let prev_count = client_count.fetch_add(1, Ordering::Release);
    if prev_count == 0 {
        session.set(SessionState::Streaming);
        println!("[STREAMING] First client connected — capture started");
    }
    println!("[STREAMING] {addr} authenticated ({} total)", prev_count + 1);

    let paused = Arc::new(std::sync::atomic::AtomicBool::new(false));

    loop {
        tokio::select! {
            event = frame_rx.recv() => {
                match event {
                    Ok(StreamEvent::Init(data)) | Ok(StreamEvent::Frame(data)) => {
                        if paused.load(Ordering::Relaxed) {
                            continue;
                        }
                        if sender.send(Message::Binary((*data).clone())).await.is_err() {
                            break;
                        }
                    }
                    Ok(StreamEvent::Reinit) => {
                        let msg = serde_json::json!({ "type": "reinit" });
                        if sender.send(Message::Text(msg.to_string())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        eprintln!("[WARN] {addr} lagged by {n} frames");
                        continue;
                    }
                    Err(_) => break,
                }
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Some(response) = handle_control_message(&text, &paused, &fps, &quality, &addr) {
                            if sender.send(Message::Text(response)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {} // Ping/Pong handled automatically by tungstenite
                }
            }
        }
    }

    let remaining = client_count.fetch_sub(1, Ordering::Release).saturating_sub(1);
    if remaining == 0 {
        session.set(SessionState::Idle);
        println!("[IDLE] {addr} disconnected — last client gone, capture paused");
    } else {
        println!("[STREAMING] {addr} disconnected — {remaining} client(s) remaining");
    }
}

fn handle_control_message(
    text: &str,
    paused: &Arc<std::sync::atomic::AtomicBool>,
    fps: &Arc<AtomicU32>,
    quality: &Arc<AtomicU8>,
    addr: &SocketAddr,
) -> Option<String> {
    let Ok(msg) = serde_json::from_str::<serde_json::Value>(text) else {
        return None;
    };

    match msg["type"].as_str() {
        Some("pause") => {
            paused.store(true, Ordering::Relaxed);
            println!("[PAUSED] {addr} paused their stream");
            None
        }
        Some("resume") => {
            paused.store(false, Ordering::Relaxed);
            println!("[STREAMING] {addr} resumed their stream");
            None
        }
        Some("config") => {
            let (new_fps, new_quality) = match msg["preset"].as_str().unwrap_or("balanced") {
                "performance" => (5u32, 40u8),
                "quality" => (15u32, 80u8),
                "custom" => {
                    let f = msg["custom"]["fps"]
                        .as_u64()
                        .unwrap_or(10)
                        .clamp(1, 30) as u32;
                    let q = msg["custom"]["quality"]
                        .as_u64()
                        .unwrap_or(60)
                        .clamp(1, 100) as u8;
                    (f, q)
                }
                _ => (10u32, 60u8), // "balanced" default
            };
            fps.store(new_fps, Ordering::Relaxed);
            quality.store(new_quality, Ordering::Relaxed);
            println!(
                "[CONFIG] {addr} changed quality → fps={new_fps} quality={new_quality}"
            );
            let response = serde_json::json!({
                "type": "quality_changed",
                "config": { "fps": new_fps, "quality": new_quality }
            });
            Some(response.to_string())
        }
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Unit tests for handle_control_message — kept inline because the function is private
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use std::str::FromStr;
    use std::sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU8, Ordering},
        Arc,
    };

    fn test_addr() -> SocketAddr {
        SocketAddr::from_str("127.0.0.1:9999").unwrap()
    }

    fn make_atomics() -> (Arc<AtomicBool>, Arc<AtomicU32>, Arc<AtomicU8>) {
        (
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicU32::new(10)),
            Arc::new(AtomicU8::new(60)),
        )
    }

    #[test]
    fn handle_control_message_pause_sets_paused() {
        let (paused, fps, quality) = make_atomics();
        let msg = r#"{"type":"pause"}"#;
        let resp = handle_control_message(msg, &paused, &fps, &quality, &test_addr());
        assert!(paused.load(Ordering::Relaxed), "paused should be true after pause message");
        assert!(resp.is_none(), "pause should not produce a response");
    }

    #[test]
    fn handle_control_message_resume_clears_paused() {
        let (paused, fps, quality) = make_atomics();
        paused.store(true, Ordering::Relaxed);
        let msg = r#"{"type":"resume"}"#;
        let resp = handle_control_message(msg, &paused, &fps, &quality, &test_addr());
        assert!(!paused.load(Ordering::Relaxed), "paused should be false after resume message");
        assert!(resp.is_none(), "resume should not produce a response");
    }

    #[test]
    fn handle_control_message_config_performance_preset() {
        let (paused, fps, quality) = make_atomics();
        let msg = r#"{"type":"config","preset":"performance"}"#;
        let resp = handle_control_message(msg, &paused, &fps, &quality, &test_addr());
        assert_eq!(fps.load(Ordering::Relaxed), 5);
        assert_eq!(quality.load(Ordering::Relaxed), 40);
        let json: serde_json::Value = serde_json::from_str(&resp.unwrap()).unwrap();
        assert_eq!(json["type"], "quality_changed");
        assert_eq!(json["config"]["fps"], 5);
        assert_eq!(json["config"]["quality"], 40);
    }

    #[test]
    fn handle_control_message_config_quality_preset() {
        let (paused, fps, quality) = make_atomics();
        let msg = r#"{"type":"config","preset":"quality"}"#;
        let resp = handle_control_message(msg, &paused, &fps, &quality, &test_addr());
        assert_eq!(fps.load(Ordering::Relaxed), 15);
        assert_eq!(quality.load(Ordering::Relaxed), 80);
        let json: serde_json::Value = serde_json::from_str(&resp.unwrap()).unwrap();
        assert_eq!(json["type"], "quality_changed");
        assert_eq!(json["config"]["fps"], 15);
        assert_eq!(json["config"]["quality"], 80);
    }

    #[test]
    fn handle_control_message_config_balanced_preset() {
        let (paused, fps, quality) = make_atomics();
        let msg = r#"{"type":"config","preset":"balanced"}"#;
        let resp = handle_control_message(msg, &paused, &fps, &quality, &test_addr());
        assert_eq!(fps.load(Ordering::Relaxed), 10);
        assert_eq!(quality.load(Ordering::Relaxed), 60);
        let json: serde_json::Value = serde_json::from_str(&resp.unwrap()).unwrap();
        assert_eq!(json["type"], "quality_changed");
        assert_eq!(json["config"]["fps"], 10);
        assert_eq!(json["config"]["quality"], 60);
    }

    #[test]
    fn handle_control_message_config_custom_values() {
        let (paused, fps, quality) = make_atomics();
        let msg = r#"{"type":"config","preset":"custom","custom":{"fps":20,"quality":75}}"#;
        let resp = handle_control_message(msg, &paused, &fps, &quality, &test_addr());
        assert_eq!(fps.load(Ordering::Relaxed), 20);
        assert_eq!(quality.load(Ordering::Relaxed), 75);
        let json: serde_json::Value = serde_json::from_str(&resp.unwrap()).unwrap();
        assert_eq!(json["config"]["fps"], 20);
        assert_eq!(json["config"]["quality"], 75);
    }

    #[test]
    fn handle_control_message_config_custom_values_are_clamped() {
        let (paused, fps, quality) = make_atomics();
        // fps=999 → clamped to 30, quality=0 → clamped to 1
        let msg = r#"{"type":"config","preset":"custom","custom":{"fps":999,"quality":0}}"#;
        let resp = handle_control_message(msg, &paused, &fps, &quality, &test_addr());
        assert_eq!(fps.load(Ordering::Relaxed), 30, "fps should be clamped to 30");
        assert_eq!(quality.load(Ordering::Relaxed), 1, "quality should be clamped to 1");
        let json: serde_json::Value = serde_json::from_str(&resp.unwrap()).unwrap();
        assert_eq!(json["config"]["fps"], 30);
        assert_eq!(json["config"]["quality"], 1);
    }

    #[test]
    fn handle_control_message_invalid_json_is_ignored() {
        let (paused, fps, quality) = make_atomics();
        // Should not panic on invalid JSON
        let resp = handle_control_message("not json {{{{", &paused, &fps, &quality, &test_addr());
        // State unchanged
        assert!(!paused.load(Ordering::Relaxed));
        assert_eq!(fps.load(Ordering::Relaxed), 10);
        assert_eq!(quality.load(Ordering::Relaxed), 60);
        assert!(resp.is_none());
    }

    #[test]
    fn handle_control_message_unknown_type_is_ignored() {
        let (paused, fps, quality) = make_atomics();
        let resp = handle_control_message(r#"{"type":"unknown_op"}"#, &paused, &fps, &quality, &test_addr());
        assert!(!paused.load(Ordering::Relaxed));
        assert_eq!(fps.load(Ordering::Relaxed), 10);
        assert_eq!(quality.load(Ordering::Relaxed), 60);
        assert!(resp.is_none());
    }
}

