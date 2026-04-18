use std::net::SocketAddr;
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicU8, AtomicUsize, Ordering},
    Arc,
};

use crate::consts::{SessionControl, SessionState};
use crate::encoders::{run_capture_loop, EncoderConfig, StreamEvent};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::{accept_async, tungstenite::Message};

pub struct Config {
    pub bind_addr: String,
    pub fps: u32,
    pub quality: u8,
    pub encoder: String,
}

pub async fn start_server(config: Config) {
    let listener = TcpListener::bind(&config.bind_addr)
        .await
        .unwrap_or_else(|e| panic!("Failed to bind to {}: {e}", config.bind_addr));

    println!("OmniView Agent ready");
    println!("  WebSocket : ws://{}", config.bind_addr);
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

    let init_cache: Arc<tokio::sync::Mutex<Option<Arc<Vec<u8>>>>> =
        Arc::new(tokio::sync::Mutex::new(None));

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
    let init_cache_fanout = init_cache.clone();
    tokio::spawn(async move {
        while let Some(event) = mpsc_rx.recv().await {
            match &event {
                StreamEvent::Init(data) => {
                    *init_cache_fanout.lock().await = Some(data.clone());
                }
                StreamEvent::Reinit => {
                    *init_cache_fanout.lock().await = None;
                }
                _ => {}
            }
            let _ = bcast_tx_fanout.send(event);
        }
    });

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
            init_cache.clone(),
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
    init_cache: Arc<tokio::sync::Mutex<Option<Arc<Vec<u8>>>>>,
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

    let prev_count = client_count.fetch_add(1, Ordering::Release);
    if prev_count == 0 {
        session.set(SessionState::Streaming);
        println!("[STREAMING] First client connected — capture started");
    }

    // Always send the cached init segment if available — both late joiners and
    // clients reconnecting after a prior session need ftyp+moov before any moof+mdat.
    let cached = init_cache.lock().await.clone();
    if let Some(data) = cached {
        if sender.send(Message::Binary((*data).clone())).await.is_err() {
            client_count.fetch_sub(1, Ordering::Release);
            return;
        }
    }

    println!("[STREAMING] {addr} connected ({} total)", prev_count + 1);

    let paused = Arc::new(AtomicBool::new(false));

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
                    _ => {}
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
    paused: &Arc<AtomicBool>,
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
                _ => (10u32, 60u8),
            };
            fps.store(new_fps, Ordering::Relaxed);
            quality.store(new_quality, Ordering::Relaxed);
            println!("[CONFIG] {addr} changed quality → fps={new_fps} quality={new_quality}");
        }
        _ => {}
    }
}
