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

    let (mpsc_tx, mut mpsc_rx) = mpsc::channel::<StreamEvent>(4);
    let (bcast_tx, _initial_rx) = broadcast::channel::<StreamEvent>(8);

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
                        handle_control_message(&text, &paused, &fps, &quality, &addr);
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
) {
    let Ok(msg) = serde_json::from_str::<serde_json::Value>(text) else {
        return;
    };

    match msg["type"].as_str() {
        Some("pause") => {
            paused.store(true, Ordering::Relaxed);
            println!("[PAUSED] {addr} paused their stream");
        }
        Some("resume") => {
            paused.store(false, Ordering::Relaxed);
            println!("[STREAMING] {addr} resumed their stream");
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
        }
        _ => {}
    }
}
