use crate::capture::ScreenCapturer;
use crate::encoder::encode;
use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::{accept_async, tungstenite::Message};

pub struct Config {
    pub bind_addr: String,
    pub fps: u32,
    pub quality: u8,
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
        handle_client(stream, config.fps, config.quality).await;
        println!("[IDLE] Client disconnected — waiting for next connection…\n");
    }
}

/// Manages a single WebSocket client session:
/// - spawns a blocking capture thread that sends JPEG bytes over an mpsc channel
/// - forwards those bytes as binary WebSocket messages
/// - tears everything down when the client disconnects or closes the tab
async fn handle_client(stream: tokio::net::TcpStream, fps: u32, quality: u8) {
    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("WebSocket handshake failed: {e}");
            return;
        }
    };
    let (mut sender, mut receiver) = ws.split();

    let frame_interval = Duration::from_secs_f64(1.0 / fps as f64);

    // Bounded channel (depth=2) provides natural back-pressure: the capture
    // thread blocks when the network hasn't drained the previous frame yet.
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(2);

    // Capture runs on a dedicated blocking thread (scrap is not async).
    let capture_handle = tokio::task::spawn_blocking(move || {
        let mut capturer = ScreenCapturer::new();
        let (width, height) = (capturer.width, capturer.height);

        loop {
            let tick = std::time::Instant::now();

            // Spin-wait until the display driver delivers a new frame.
            let raw_frame = loop {
                match capturer.try_capture() {
                    Some(f) => break f,
                    None => std::thread::sleep(Duration::from_millis(1)),
                }
            };

            let jpeg = encode(&raw_frame, width, height, quality);

            // Channel closed → client is gone, stop capturing.
            if tx.blocking_send(jpeg).is_err() {
                break;
            }

            // Sleep the remainder of the frame interval to maintain target FPS.
            let elapsed = tick.elapsed();
            if elapsed < frame_interval {
                std::thread::sleep(frame_interval - elapsed);
            }
        }
    });

    // Drive the WebSocket: forward frames from the capture thread and react to
    // any control messages (Close, errors) from the client.
    loop {
        tokio::select! {
            // A new JPEG frame is ready — send it.
            frame = rx.recv() => {
                match frame {
                    Some(jpeg) => {
                        if sender.send(Message::Binary(jpeg)).await.is_err() {
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
