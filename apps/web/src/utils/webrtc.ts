const BASE =
	(window as { electronAPI?: { backendUrl?: string } }).electronAPI?.backendUrl ?? "/api";

/** Compute SHA-256 hex of a string using the Web Crypto API. */
export async function sha256hex(text: string): Promise<string> {
	const encoded = new TextEncoder().encode(text);
	const buffer = await crypto.subtle.digest("SHA-256", encoded);
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Return the WebSocket URL for the backend signaling gateway. */
export function getSignalingUrl(): string {
	const base = BASE.replace(/^http/, "ws");
	return `${base}/ws`;
}

/**
 * Create a sender (host) RTCPeerConnection pre-configured with a display
 * MediaStream. Caller must negotiate with the remote peer via the signaling
 * gateway before calling `setRemoteDescription`.
 */
export function createSenderPeer(stream: MediaStream): RTCPeerConnection {
	const pc = new RTCPeerConnection({
		iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
	});
	for (const track of stream.getTracks()) {
		pc.addTrack(track, stream);
	}
	return pc;
}

/**
 * Create a receiver (viewer) RTCPeerConnection.
 * Caller should attach `ontrack` before calling `setRemoteDescription`.
 */
export function createReceiverPeer(): RTCPeerConnection {
	return new RTCPeerConnection({
		iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
	});
}
