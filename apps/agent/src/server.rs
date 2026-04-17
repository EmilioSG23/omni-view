use crate::encoders::{run_capture_loop, EncoderConfig};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::{accept_async, tungstenite::Message};

pub struct Config {
    pub bind_addr: String,
    pub fps: u32,
    pub quality: u8,
    pub encoder: String,
}

/// Starts the WebSocket server. Handles **one client at a time** — the server
/// blocks until the current client disconnects before accepting the next one.
/// While no client is connected the capture thread is completely idle.
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

/// Manages a single WebSocket client session.
/// Spawns a blocking capture+encode thread and forwards its output as binary
/// WebSocket messages until the client disconnects.
async fn handle_client(stream: tokio::net::TcpStream, fps: u32, quality: u8, encoder: String) {
    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("WebSocket handshake failed: {e}");
            return;
        }
    };
    let (mut sender, mut receiver) = ws.split();

    // Bounded channel (depth=2) provides natural back-pressure.
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(2);

    // All capture/encode logic lives in the encoders module; server.rs knows
    // nothing about specific codecs.
    let capture_handle = tokio::task::spawn_blocking(move || {
        run_capture_loop(EncoderConfig { encoder, fps, quality }, tx);
    });

    // Drive the WebSocket: forward frames from the capture thread and react to
    // any control messages (Close, errors) from the client.
    loop {
        tokio::select! {
            // A new encoded frame is ready — send it.
            frame = rx.recv() => {
                match frame {
                    Some(encoded) => {
                        if sender.send(Message::Binary(encoded)).await.is_err() {
                            break;
                        }
                    }
                    None => break, // capture thread exited
                }
            }
            // An incoming message arrived from the client.
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {} // Pings are handled automatically by tungstenite
                }
            }
        }
    }

    // Drop the receiver so that the capture thread's next blocking_send fails
    // and it exits cleanly, then wait for it.
    drop(rx);
    let _ = capture_handle.await;
}
