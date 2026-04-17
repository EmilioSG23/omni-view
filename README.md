# OmniView — Phase 1 (MVP)

> On-demand screen viewing, simple and efficient.

Stream your PC screen to any browser over a local WebSocket connection.

---

## Architecture

```
[ PC (Rust agent) ] ──── WebSocket (ws://) ────► [ Browser (client-web) ]
  capture + JPEG encode                            render frames as <img>
```

The agent is **on-demand**: it captures the screen only while a client is connected, and is completely idle otherwise.

---

## Project structure

```
omni-view/
├── agent-rust/          ← Rust WebSocket streaming agent
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs      ← CLI entry-point
│       ├── capture.rs   ← scrap screen capturer (BGRA frames)
│       ├── encoder.rs   ← BGRA → RGB → JPEG encoder
│       └── server.rs    ← TCP + WebSocket server, on-demand logic
└── client-web/          ← Zero-dependency static web client
    ├── index.html
    └── app.js
```

---

## Prerequisites

### Rust toolchain (first time only)

Install Rust via [rustup](https://rustup.rs/):

```powershell
# Windows (PowerShell)
winget install Rustlang.Rustup
# then restart your terminal, or:
$env:PATH += ";$env:USERPROFILE\.cargo\bin"
```

Or download the installer directly from <https://rustup.rs>.

Verify:

```powershell
rustc --version   # rustc 1.x.x
cargo --version   # cargo 1.x.x
```

---

## Running

### 1. Build the agent

```powershell
cd agent-rust
cargo build --release
```

First build downloads dependencies (~2 min). Subsequent builds are much faster.

The binary is produced at `agent-rust/target/release/omniview-agent.exe`.

### 2. Start the agent

```powershell
# Default: 0.0.0.0:9001, 10 fps, JPEG quality 50
.\target\release\omniview-agent.exe

# Custom settings
.\target\release\omniview-agent.exe --bind 0.0.0.0:9001 --fps 15 --jpeg-quality 65
```

Available flags:

| Flag             | Default        | Description                     |
| ---------------- | -------------- | ------------------------------- |
| `--bind`         | `0.0.0.0:9001` | Address:port to listen on       |
| `--fps`          | `10`           | Target frames per second (1–30) |
| `--jpeg-quality` | `50`           | JPEG quality (1–100)            |

### 3. Open the web client

Open `client-web/index.html` in a browser (double-click, or serve it):

```powershell
# Quick static server (Python)
cd client-web
python -m http.server 8080
# then open http://localhost:8080
```

Enter the agent address (`localhost:9001` for local use, or your PC's IP for other devices) and click **Connect**.

---

## Connecting from another device (e.g. phone)

1. Find your PC's local IP:
   ```powershell
   ipconfig | findstr "IPv4"
   ```
2. Make sure port `9001` is reachable (Windows Defender Firewall may need an inbound rule).
3. In the browser on your phone, enter `ws://192.168.x.x:9001` and connect.

---

## State machine

```
IDLE   → no clients → capture thread NOT running
ACTIVE → client connected → capture thread running, frames being sent
STOP   → client disconnects → capture thread signals exit → IDLE
```

---

## Performance tuning

| Symptom            | Fix                                                 |
| ------------------ | --------------------------------------------------- |
| High CPU           | Lower `--fps` or `--jpeg-quality`                   |
| Blurry image       | Raise `--jpeg-quality` (80+)                        |
| High latency       | Lower `--jpeg-quality` or reduce display resolution |
| Dropped connection | Check firewall / NAT rules                          |

---

## Phase 1 limitations

- Single client at a time
- JPEG only (no video codec)
- No NAT traversal (direct IP required)
- ~5–15 fps practical limit on most hardware
- No input forwarding (view-only)

---

## Roadmap

| Phase       | Transport       | Codec        | Traversal |
| ----------- | --------------- | ------------ | --------- |
| **1 (now)** | WebSocket / TCP | JPEG         | Direct IP |
| 2           | WebSocket / TCP | JPEG + delta | Direct IP |
| 3           | WebSocket       | H.264 (soft) | Direct IP |
| 4           | WebRTC / UDP    | H.264        | STUN/TURN |
