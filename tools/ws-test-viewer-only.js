const WebSocket = require("ws");

function wait(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

(async () => {
	const url = process.argv[2] || "ws://localhost:5173/api/ws";
	console.log("[test] connecting to", url);

	const viewer = new WebSocket(url);

	viewer.on("open", () => {
		console.log("[viewer] open");
		viewer.send(
			JSON.stringify({
				event: "viewer:request",
				data: {
					agentId: "955841573275",
					viewerId: "955841573275",
					password: "emilio",
					label: "node-ws-viewer-only",
				},
			}),
		);
	});

	viewer.on("message", (m) => console.log("[viewer] msg:", m.toString()));
	viewer.on("close", (code, reason) =>
		console.log("[viewer] close", code, reason && reason.toString()),
	);
	viewer.on("error", (e) => console.error("[viewer] error", e && e.message));

	// keep alive for 12s so we can observe pending/close
	await wait(12000);
	console.log("[test] closing viewer");
	viewer.close();
	await wait(200);
	process.exit(0);
})();
