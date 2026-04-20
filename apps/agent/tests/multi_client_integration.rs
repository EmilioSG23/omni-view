/// Integration tests for multi-client WebSocket connections to the OmniView agent.
///
/// These tests start a real Tokio-based WebSocket server using
/// `start_server_with_injected`, which skips the real screen-capture loop and
/// instead accepts frames injected through a `broadcast::Sender<StreamEvent>`.
/// No display or hardware dependencies are required.
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use omniview_agent::config::interface::Config as ServerConfig;
use omniview_agent::encoders::StreamEvent;
use omniview_agent::server::start_server_with_injected;
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_tungstenite::{connect_async, tungstenite::Message};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Compute a SHA-256 hex digest — mirrors `omniview_agent::config::hash_password`.
fn hash_password(password: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

const TEST_PASSWORD: &str = "integration_test_password";
const TEST_AGENT_ID: &str = "test-agent-00000000-0000-0000-0000-000000000001";

/// Bind to `127.0.0.1:0`, get the assigned port, then release the listener so
/// the server can bind to it a moment later.  There is a small TOCTOU window
/// but it is acceptable in a single-machine test environment.
async fn free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    listener.local_addr().unwrap().port()
}

/// Build a minimal `ServerConfig` for tests.
fn test_config(port: u16) -> ServerConfig {
    ServerConfig {
        bind_addr: format!("127.0.0.1:{port}"),
        fps: 10,
        quality: 60,
        encoder: "img".to_string(),
        password_hash: hash_password(TEST_PASSWORD),
        agent_id: TEST_AGENT_ID.to_string(),
    }
}

/// Connect a single WebSocket client to the server and perform the auth
/// handshake.  Returns the split (write, read) halves on success.
async fn connect_and_auth(
    addr: &str,
) -> (
    futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
) {
    let url = format!("ws://{addr}");
    let (ws, _) = connect_async(&url).await.expect("WebSocket connect failed");
    let (mut write, mut read) = ws.split();

    // Send auth message
    let auth = serde_json::json!({ "type": "auth", "password": TEST_PASSWORD });
    write
        .send(Message::Text(auth.to_string()))
        .await
        .expect("Failed to send auth");

    // Expect auth_ok
    let msg = read
        .next()
        .await
        .expect("No message received after auth")
        .expect("WebSocket error");
    let text = msg.into_text().expect("Expected text message");
    let json: serde_json::Value = serde_json::from_str(&text).expect("Expected JSON");
    assert_eq!(json["type"], "auth_ok", "Expected auth_ok, got: {json}");
    assert_eq!(json["agent_id"], TEST_AGENT_ID);

    (write, read)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// A single client can authenticate and receive a binary frame injected by the
/// test harness.
#[tokio::test]
async fn single_client_receives_injected_frame() {
    let port = free_port().await;
    let config = test_config(port);
    let (frame_tx, _) = broadcast::channel::<StreamEvent>(64);

    // Start the server in the background.
    let frame_tx_clone = frame_tx.clone();
    tokio::spawn(async move {
        start_server_with_injected(config, Some(frame_tx_clone)).await;
    });
    // Give the server a moment to bind.
    tokio::time::sleep(Duration::from_millis(50)).await;

    let addr = format!("127.0.0.1:{port}");
    let (_write, mut read) = connect_and_auth(&addr).await;

    // Inject a frame
    let fake_frame = Arc::new(b"JPEG_FRAME_DATA".to_vec());
    frame_tx
        .send(StreamEvent::Frame(fake_frame.clone()))
        .expect("Failed to inject frame");

    // The client should receive the frame as a binary message.
    let msg = tokio::time::timeout(Duration::from_secs(2), read.next())
        .await
        .expect("Timeout waiting for frame")
        .expect("Stream ended")
        .expect("WS error");

    assert!(msg.is_binary(), "Expected binary frame message");
    assert_eq!(msg.into_data(), *fake_frame);
}

/// Multiple clients simultaneously connected to the same server all receive the
/// same injected frames (broadcast fan-out).
#[tokio::test]
async fn multiple_clients_all_receive_same_frame() {
    const N: usize = 5;
    let port = free_port().await;
    let config = test_config(port);
    let (frame_tx, _) = broadcast::channel::<StreamEvent>(64);

    let frame_tx_server = frame_tx.clone();
    tokio::spawn(async move {
        start_server_with_injected(config, Some(frame_tx_server)).await;
    });
    tokio::time::sleep(Duration::from_millis(50)).await;

    let addr = format!("127.0.0.1:{port}");

    // Connect N clients concurrently and authenticate each one.
    let mut readers = Vec::with_capacity(N);
    for _ in 0..N {
        let (_w, r) = connect_and_auth(&addr).await;
        readers.push(r);
    }

    // Inject a single frame after all clients are connected.
    let fake_frame = Arc::new(b"BROADCAST_FRAME".to_vec());
    frame_tx
        .send(StreamEvent::Frame(fake_frame.clone()))
        .expect("Failed to inject frame");

    // Every client should receive the frame.
    for (i, reader) in readers.iter_mut().enumerate() {
        let msg = tokio::time::timeout(Duration::from_secs(2), reader.next())
            .await
            .unwrap_or_else(|_| panic!("Timeout on client {i}"))
            .unwrap_or_else(|| panic!("Stream ended for client {i}"))
            .unwrap_or_else(|e| panic!("WS error on client {i}: {e}"));

        assert!(msg.is_binary(), "Client {i}: expected binary");
        assert_eq!(msg.into_data(), *fake_frame, "Client {i}: wrong frame data");
    }
}

/// A client that sends an incorrect password must receive `auth_error` and
/// the connection must be closed by the server.
#[tokio::test]
async fn auth_failure_returns_auth_error() {
    let port = free_port().await;
    let config = test_config(port);
    let (frame_tx, _) = broadcast::channel::<StreamEvent>(64);

    tokio::spawn(async move {
        start_server_with_injected(config, Some(frame_tx)).await;
    });
    tokio::time::sleep(Duration::from_millis(50)).await;

    let url = format!("ws://127.0.0.1:{port}");
    let (ws, _) = connect_async(&url).await.expect("WebSocket connect failed");
    let (mut write, mut read) = ws.split();

    let bad_auth = serde_json::json!({ "type": "auth", "password": "wrong_password" });
    write
        .send(Message::Text(bad_auth.to_string()))
        .await
        .expect("Failed to send auth");

    let msg = tokio::time::timeout(Duration::from_secs(2), read.next())
        .await
        .expect("Timeout waiting for auth_error")
        .expect("Stream ended before auth_error")
        .expect("WS error");

    let text = msg.into_text().expect("Expected text");
    let json: serde_json::Value = serde_json::from_str(&text).expect("Expected JSON");
    assert_eq!(json["type"], "auth_error");
    assert_eq!(json["reason"], "invalid_password");
}

/// When a client sends a `pause` control message it stops receiving frames.
/// When it sends `resume` it starts receiving frames again.
#[tokio::test]
async fn pause_and_resume_controls_frame_delivery() {
    let port = free_port().await;
    let config = test_config(port);
    let (frame_tx, _) = broadcast::channel::<StreamEvent>(64);
    let frame_tx_server = frame_tx.clone();

    tokio::spawn(async move {
        start_server_with_injected(config, Some(frame_tx_server)).await;
    });
    tokio::time::sleep(Duration::from_millis(50)).await;

    let addr = format!("127.0.0.1:{port}");
    let (mut write, mut read) = connect_and_auth(&addr).await;

    // Send pause
    let pause_msg = serde_json::json!({ "type": "pause" });
    write
        .send(Message::Text(pause_msg.to_string()))
        .await
        .expect("Failed to send pause");

    // Give the server time to process pause before injecting
    tokio::time::sleep(Duration::from_millis(30)).await;

    let paused_frame = Arc::new(b"SHOULD_NOT_ARRIVE".to_vec());
    frame_tx
        .send(StreamEvent::Frame(paused_frame))
        .expect("Failed to inject frame (pause)");

    // Frame should NOT arrive while paused — timeout is expected.
    let result = tokio::time::timeout(Duration::from_millis(200), read.next()).await;
    assert!(result.is_err(), "Client received frame while paused");

    // Send resume
    let resume_msg = serde_json::json!({ "type": "resume" });
    write
        .send(Message::Text(resume_msg.to_string()))
        .await
        .expect("Failed to send resume");
    tokio::time::sleep(Duration::from_millis(30)).await;

    let live_frame = Arc::new(b"LIVE_FRAME_AFTER_RESUME".to_vec());
    frame_tx
        .send(StreamEvent::Frame(live_frame.clone()))
        .expect("Failed to inject frame (resume)");

    let msg = tokio::time::timeout(Duration::from_secs(2), read.next())
        .await
        .expect("Timeout waiting for frame after resume")
        .expect("Stream ended")
        .expect("WS error");

    assert!(msg.is_binary());
    assert_eq!(msg.into_data(), *live_frame);
}

/// Sending a `config` message with a known preset changes the quality settings
/// that the server exposes — tested indirectly by verifying the server stays
/// alive and a subsequent frame is still delivered.
#[tokio::test]
async fn quality_config_preset_is_accepted() {
    let port = free_port().await;
    let config = test_config(port);
    let (frame_tx, _) = broadcast::channel::<StreamEvent>(64);
    let frame_tx_server = frame_tx.clone();

    tokio::spawn(async move {
        start_server_with_injected(config, Some(frame_tx_server)).await;
    });
    tokio::time::sleep(Duration::from_millis(50)).await;

    let addr = format!("127.0.0.1:{port}");
    let (mut write, mut read) = connect_and_auth(&addr).await;

    for preset in &["performance", "balanced", "quality"] {
        let cfg_msg = serde_json::json!({ "type": "config", "preset": preset });
        write
            .send(Message::Text(cfg_msg.to_string()))
            .await
            .unwrap_or_else(|e| panic!("Failed to send config ({preset}): {e}"));
    }

    // Inject a frame after config changes — server should still deliver it.
    let frame = Arc::new(b"POST_CONFIG_FRAME".to_vec());
    frame_tx
        .send(StreamEvent::Frame(frame.clone()))
        .expect("Failed to inject frame");

    let msg = tokio::time::timeout(Duration::from_secs(2), read.next())
        .await
        .expect("Timeout waiting for frame after config")
        .expect("Stream ended")
        .expect("WS error");

    assert!(msg.is_binary());
    assert_eq!(msg.into_data(), *frame);
}

/// When one client disconnects, the other clients still receive frames.
#[tokio::test]
async fn remaining_clients_receive_frames_after_peer_disconnect() {
    let port = free_port().await;
    let config = test_config(port);
    let (frame_tx, _) = broadcast::channel::<StreamEvent>(64);
    let frame_tx_server = frame_tx.clone();

    tokio::spawn(async move {
        start_server_with_injected(config, Some(frame_tx_server)).await;
    });
    tokio::time::sleep(Duration::from_millis(50)).await;

    let addr = format!("127.0.0.1:{port}");
    let (mut write_a, read_a) = connect_and_auth(&addr).await;
    let (_write_b, mut read_b) = connect_and_auth(&addr).await;

    // Disconnect client A gracefully.
    write_a
        .send(Message::Close(None))
        .await
        .expect("Failed to close client A");
    drop(write_a);
    drop(read_a);

    tokio::time::sleep(Duration::from_millis(50)).await;

    // Client B should still receive frames.
    let frame = Arc::new(b"FRAME_AFTER_PEER_DISCONNECT".to_vec());
    frame_tx
        .send(StreamEvent::Frame(frame.clone()))
        .expect("Failed to inject frame");

    let msg = tokio::time::timeout(Duration::from_secs(2), read_b.next())
        .await
        .expect("Timeout — client B did not receive frame after A disconnected")
        .expect("Stream ended")
        .expect("WS error");

    assert!(msg.is_binary());
    assert_eq!(msg.into_data(), *frame);
}

/// The `Reinit` event is delivered as a JSON text message `{ "type": "reinit" }`.
#[tokio::test]
async fn reinit_event_delivered_as_json_text() {
    let port = free_port().await;
    let config = test_config(port);
    let (frame_tx, _) = broadcast::channel::<StreamEvent>(64);
    let frame_tx_server = frame_tx.clone();

    tokio::spawn(async move {
        start_server_with_injected(config, Some(frame_tx_server)).await;
    });
    tokio::time::sleep(Duration::from_millis(50)).await;

    let addr = format!("127.0.0.1:{port}");
    let (_write, mut read) = connect_and_auth(&addr).await;

    frame_tx
        .send(StreamEvent::Reinit)
        .expect("Failed to inject Reinit");

    let msg = tokio::time::timeout(Duration::from_secs(2), read.next())
        .await
        .expect("Timeout waiting for reinit")
        .expect("Stream ended")
        .expect("WS error");

    assert!(msg.is_text(), "Expected text message for Reinit");
    let json: serde_json::Value =
        serde_json::from_str(&msg.into_text().unwrap()).expect("Expected JSON");
    assert_eq!(json["type"], "reinit");
}
