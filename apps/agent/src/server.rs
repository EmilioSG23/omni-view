use crate::encoders::{run_capture_loop, EncoderConfig, StreamEvent};
use futures_util::{SinkExt, StreamExt};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
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
    println!("  WebSocket: ws://{}", config.bind_addr);
    println!("  FPS:       {}", config.fps);
    println!("  Quality:   {}", config.quality);
		println!("  Encoder:   {}", config.encoder);
    println!("\n[IDLE] Waiting for client…");

    loop {
        let (stream, addr) = match listener.accept().await {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Accept error: {e}");
                continue;
            }
        };

        println!("[ACTIVE] Client connected from {addr}");
        handle_client(stream, config.fps, config.quality, config.encoder.clone()).await;
        println!("[IDLE] Client disconnected — waiting for next connection…\n");
    }
}

async fn handle_client(stream: tokio::net::TcpStream, fps: u32, quality: u8, encoder: String) {
    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("WebSocket handshake failed: {e}");
            return;
        }
    };
    let (mut sender, mut receiver) = ws.split();
    let (tx, mut rx) = mpsc::channel::<StreamEvent>(2);

    let paused = Arc::new(AtomicBool::new(false));
    let paused_capture = Arc::clone(&paused);

    let capture_handle = tokio::task::spawn_blocking(move || {
        run_capture_loop(EncoderConfig { encoder, fps, quality }, tx, paused_capture);
    });

    loop {
        tokio::select! {
            event = rx.recv() => {
                match event {
                    Some(StreamEvent::Frame(data)) => {
                        if sender.send(Message::Binary(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(StreamEvent::Reinit) => {
                        if sender.send(Message::Text("reinit".into())).await.is_err() {
                            break;
                        }
                    }
                    None => break, // capture thread exited
                }
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        match text.as_str() {
                            "pause"  => paused.store(true,  Ordering::Relaxed),
                            "resume" => paused.store(false, Ordering::Relaxed),
                            _        => {}
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {} // Pings are handled automatically by tungstenite
                }
            }
        }
    }
    drop(rx);
    let _ = capture_handle.await;
}
