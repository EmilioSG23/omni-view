/** @type {HTMLImageElement} */
const img = document.getElementById("screen");
const placeholder = document.getElementById("placeholder");
const statusEl = document.getElementById("status");
const btnConnect = document.getElementById("btn-connect");
const btnDisconnect = document.getElementById("btn-disconnect");
const wsUrlInput = document.getElementById("ws-url");
const fpsDisplay = document.getElementById("fps-display");

/** @type {WebSocket|null} */
let ws = null;

/** URL of the previous frame blob — revoked after each new frame to avoid leaks */
let prevBlobUrl = null;

// FPS counter
let frameCount = 0;
let lastFpsTick = performance.now();
setInterval(() => {
	const now = performance.now();
	const elapsed = (now - lastFpsTick) / 1000;
	if (elapsed > 0) {
		const fps = (frameCount / elapsed).toFixed(1);
		fpsDisplay.textContent = ws?.readyState === WebSocket.OPEN ? `${fps} fps` : "";
	}
	frameCount = 0;
	lastFpsTick = now;
}, 1000);

// ── status helpers ──────────────────────────────────────────────────────────

/** @param {"idle"|"connecting"|"connected"|"error"} state */
function setStatus(state) {
	statusEl.textContent = state.toUpperCase();
	statusEl.className = `badge ${state}`;
}

// ── connection ──────────────────────────────────────────────────────────────

function connect() {
	const raw = wsUrlInput.value.trim();
	if (!raw) return;

	// Normalise: prepend ws:// if the user omitted the scheme
	const url = raw.startsWith("ws://") || raw.startsWith("wss://") ? raw : `ws://${raw}`;

	setStatus("connecting");
	btnConnect.disabled = true;
	btnDisconnect.disabled = false;

	ws = new WebSocket(url);
	ws.binaryType = "blob";

	ws.onopen = () => {
		setStatus("connected");
		img.style.display = "block";
		placeholder.style.display = "none";
	};

	ws.onmessage = (event) => {
		// Revoke the previous object URL to free memory immediately
		if (prevBlobUrl) {
			URL.revokeObjectURL(prevBlobUrl);
		}
		prevBlobUrl = URL.createObjectURL(event.data);
		img.src = prevBlobUrl;
		frameCount++;
	};

	ws.onerror = () => {
		setStatus("error");
		console.error("WebSocket error");
	};

	ws.onclose = () => {
		if (prevBlobUrl) {
			URL.revokeObjectURL(prevBlobUrl);
			prevBlobUrl = null;
		}
		setStatus("idle");
		btnConnect.disabled = false;
		btnDisconnect.disabled = true;
		img.style.display = "none";
		placeholder.style.display = "block";
		fpsDisplay.textContent = "";
		ws = null;
	};
}

function disconnect() {
	if (ws) ws.close();
}

// ── event listeners ─────────────────────────────────────────────────────────

btnConnect.addEventListener("click", connect);
btnDisconnect.addEventListener("click", disconnect);

// Allow pressing Enter in the URL field to connect
wsUrlInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !btnConnect.disabled) connect();
});
