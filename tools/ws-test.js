const WebSocket = require("ws");
const crypto = require("crypto");

function wait(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

(async () => {
	const url = "ws://localhost:3000/api/ws";
	const secret = "testpass123";
	const hash = crypto.createHash("sha256").update(secret).digest("hex");

	console.log("[test] secret:", secret);
	console.log("[test] hash:", hash);

	const host = new WebSocket(url);
	host.on("open", () => {
		console.log("[host] connected");
		host.send(
			JSON.stringify({ event: "host:join", data: { agentId: "test-agent-1", passwordHash: hash } }),
		);
	});
	host.on("message", (m) => console.log("[host] msg:", m.toString()));
	host.on("close", () => console.log("[host] closed"));
	host.on("error", (e) => console.error("[host] error", e && e.message));

	await wait(300);

	const viewer = new WebSocket(url);
	viewer.on("open", () => {
		console.log("[viewer] connected; sending viewer:request with correct password");
		viewer.send(
			JSON.stringify({
				event: "viewer:request",
				data: {
					agentId: "test-agent-1",
					viewerId: "viewer-1",
					password: secret,
					label: "node-ws-test",
				},
			}),
		);
	});
	viewer.on("message", (m) => console.log("[viewer] msg:", m.toString()));
	viewer.on("close", () => console.log("[viewer] closed"));
	viewer.on("error", (e) => console.error("[viewer] error", e && e.message));

	// wait a few seconds to observe messages
	await wait(3000);

	console.log("[test] closing sockets");
	viewer.close();
	host.close();

	process.exit(0);
})();
