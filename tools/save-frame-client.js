#!/usr/bin/env node
/**
 * tools/save-frame-client.js
 *
 * Manual smoke-test client for the OmniView agent WebSocket.
 * Connects, authenticates, receives frames and saves them to ./captures/
 *
 * Usage:
 *   node tools/save-frame-client.js [url] [password] [max-frames]
 *
 * Defaults:
 *   url        ws://127.0.0.1:9000
 *   password   (read from AGENT_PASSWORD env var, or "changeme")
 *   max-frames 10
 *
 * Example:
 *   AGENT_PASSWORD=secret node tools/save-frame-client.js ws://127.0.0.1:9000
 */

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const url = process.argv[2] || "ws://127.0.0.1:9000";
const password = process.argv[3] || process.env.AGENT_PASSWORD || "changeme";
const maxFrames = parseInt(process.argv[4] ?? "10", 10);

const capturesDir = path.join(__dirname, "..", "captures");
fs.mkdirSync(capturesDir, { recursive: true });

let frameCount = 0;

console.log(`Connecting to ${url} (will save ${maxFrames} frame(s) to ./captures/)...`);

const ws = new WebSocket(url);

ws.on("open", () => {
	ws.send(JSON.stringify({ type: "auth", password }));
	console.log("Auth sent");
});

ws.on("message", (data) => {
	if (typeof data === "string") {
		let msg;
		try {
			msg = JSON.parse(data);
		} catch {
			return;
		}
		console.log("← TEXT:", msg);

		if (msg.type === "auth_ok") {
			console.log(`Authenticated. Waiting for frames...`);
		} else if (msg.type === "auth_error") {
			console.error("Auth rejected:", msg.reason);
			ws.close();
			process.exit(1);
		}
		return;
	}

	// Binary frame
	frameCount++;
	const filename = path.join(capturesDir, `frame-${String(frameCount).padStart(4, "0")}.jpg`);
	fs.writeFileSync(filename, data);
	console.log(`✓ Saved frame ${frameCount}/${maxFrames} → ${filename} (${data.length} bytes)`);

	if (frameCount >= maxFrames) {
		console.log("Done. Closing connection.");
		ws.close(1000, "done");
	}
});

ws.on("close", (code, reason) => {
	console.log(
		`Connection closed (code=${code} reason=${reason}). Received ${frameCount} frame(s).`,
	);
});

ws.on("error", (err) => {
	console.error("WebSocket error:", err.message);
	process.exit(1);
});
