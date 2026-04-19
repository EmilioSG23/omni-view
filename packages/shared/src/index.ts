/**
 * OmniView shared protocol types and DTOs.
 * Used by backend and client apps for type-safe communication.
 */

// ─── Quality Presets ─────────────────────────────────────────────────────────

export type QualityPreset = "performance" | "balanced" | "quality" | "custom";

export interface QualityConfig {
	fps: number;
	/**
	 * Encoder quality hint 1–100.
	 * Used by the image fallback encoder (JPEG/PNG/WebP).
	 * In H264/fMP4 mode the agent uses fps as the primary quality lever and
	 * this value has no effect unless the encoder maps it to a CRF parameter.
	 */
	quality: number;
}

export const QUALITY_PRESETS: Record<Exclude<QualityPreset, "custom">, QualityConfig> = {
	performance: { fps: 5, quality: 40 },
	balanced: { fps: 10, quality: 60 },
	quality: { fps: 15, quality: 80 },
};

// Maximum allowed length for an agent session password. Projects should
// import this constant from `@omni-view/shared` to keep the same limit.
export const AGENT_PASSWORD_MAX_LENGTH = 8;

/**
 * Generate a random agent password consisting of letters and digits only.
 * Uses the shared Web Crypto API when available, falling back to Math.random.
 */
export function generateAgentPassword(length = AGENT_PASSWORD_MAX_LENGTH): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	// Prefer secure RNG when available
	const cryptoObj = typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined;
	if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
		const arr = new Uint32Array(length);
		cryptoObj.getRandomValues(arr);
		let out = "";
		for (let i = 0; i < length; i++) {
			out += chars[arr[i] % chars.length];
		}
		return out;
	}

	let out = "";
	for (let i = 0; i < length; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}

// ─── Stream Transport ─────────────────────────────────────────────────────────

/**
 * Describes the binary frame format produced by the agent.
 *
 * - `"fmp4-h264"` — fragmented MP4 container with H.264 video (default).
 *   The first binary frame is the init segment (`ftyp`+`moov`); subsequent
 *   frames are `moof`+`mdat` chunks consumable via the MediaSource Extensions API.
 * - `"jpeg"` / `"png"` / `"webp"` — independent image frames (fallback encoders).
 *   Each binary frame is a complete, independently decodable image.
 */
export type StreamTransport = "fmp4-h264" | "jpeg" | "png" | "webp";

// ─── Agent States ─────────────────────────────────────────────────────────────

/**
 * Represents the logical state of the agent session as seen by the client.
 *
 * States emitted by the agent at runtime: `"idle"`, `"connecting"`, `"streaming"`, `"paused"`.
 * `"degraded"` is a **client-derived** state — the frontend infers it from
 * missing segments, repeated `reinit` events, or excessive reconnect attempts.
 * The agent binary never emits this state directly.
 */
export type AgentState = "idle" | "connecting" | "streaming" | "paused" | "degraded";

// ─── Client → Agent Protocol (WebSocket text frames) ─────────────────────────

/** First message after WS connection: authenticate before streaming starts. */
export interface AuthMessage {
	type: "auth";
	password: string;
}

/** Change streaming quality preset. */
export interface ConfigMessage {
	type: "config";
	preset: QualityPreset;
	/** Required only when preset is "custom". */
	custom?: QualityConfig;
}

/** Pause frame delivery to this client. */
export interface PauseMessage {
	type: "pause";
}

/** Resume frame delivery to this client. */
export interface ResumeMessage {
	type: "resume";
}

export type ClientToAgentMessage = AuthMessage | ConfigMessage | PauseMessage | ResumeMessage;

// ─── Agent → Client Protocol (WebSocket text frames) ─────────────────────────

/** Sent after successful authentication. */
export interface AuthOkMessage {
	type: "auth_ok";
	agent_id: string;
}

/** Sent when authentication fails; connection will be closed after. */
export interface AuthErrorMessage {
	type: "auth_error";
	reason: "invalid_password" | "server_error";
}

/**
 * Notifies the client that the display was re-initialised
 * (e.g. resolution changed). The next binary frame will be a full keyframe.
 */
export interface ReinitMessage {
	type: "reinit";
}

/** Sent after a successful quality config change — confirms the new settings. */
export interface QualityChangedMessage {
	type: "quality_changed";
	config: QualityConfig;
}

export type AgentToClientMessage =
	| AuthOkMessage
	| AuthErrorMessage
	| ReinitMessage
	| QualityChangedMessage;

// Note: frame data is sent as binary WebSocket frames (no JSON wrapper).

// ─── Backend REST API — Agent Registration ───────────────────────────────────

export interface RegisterAgentDto {
	/** Stable UUID identifying this agent instance. */
	agent_id: string;
	/** Optional human-readable label (e.g. hostname). */
	label?: string;
	/** Semver version string of the agent binary. */
	version: string;
}

export interface RegisterAgentResponse {
	agent_id: string;
	/** ISO 8601 timestamp */
	registered_at: string;
}

export interface AgentSummary {
	agent_id: string;
	label?: string;
	version: string;
	/**
	 * WebSocket URL where the agent is reachable for direct client connections.
	 * Example: ws://192.168.1.5:9000
	 * May be null if the agent did not register a URL or uses browser capture.
	 */
	ws_url?: string | null;
	/** Capture mode: native Rust agent or browser WebRTC. Defaults to 'native'. */
	capture_mode?: CaptureMode;
	registered_at: string;
	last_seen_at: string;
}

// ─── Backend REST API — Whitelist ────────────────────────────────────────────

export interface AddToWhitelistDto {
	/** Stable identifier for the client device (UUID, fingerprint, etc.). */
	device_id: string;
	/** Optional human-readable label. */
	label?: string;
}

export interface WhitelistEntry {
	id: string;
	agent_id: string;
	device_id: string;
	label?: string;
	/** ISO 8601 */
	created_at: string;
}

export interface CheckWhitelistResponse {
	allowed: boolean;
}

// ─── Capture mode ─────────────────────────────────────────────────────────────

/**
 * How this agent captures and transmits its screen.
 * - `"native"`: Rust agent running locally, streams over a direct WebSocket (`ws_url`).
 * - `"browser"`: Browser tab using `getDisplayMedia`, streams via WebRTC through the backend gateway.
 */
export type CaptureMode = "native" | "browser";

// ─── Backend REST API — Backend-pull Status ───────────────────────────────────

/** Response for GET /api/agents/:id/status */
export interface AgentStatusResponse {
	/** The agent UUID. */
	agentId: string;
	/** Whether the backend currently has an open connection to this agent. */
	connected: boolean;
}

// ─── WebRTC signaling — viewer session ───────────────────────────────────────

/** A viewer currently watching an agent's screen via WebRTC. */
export interface ViewerInfo {
	viewer_id: string;
	/** Optional human-readable label (device name, etc.). */
	label?: string;
	/** ISO 8601 timestamp of when the viewer connected. */
	connected_at: string;
}

// ─── WebRTC signaling — SDP / ICE primitives ─────────────────────────────────

/** SDP offer or answer description (avoids importing browser-only RTCSessionDescriptionInit). */
export interface SdpDescription {
	type: "offer" | "answer" | "pranswer" | "rollback";
	sdp: string;
}

/** ICE candidate (avoids importing browser-only RTCIceCandidateInit). */
export interface IceCandidatePayload {
	candidate: string;
	sdpMid: string | null;
	sdpMLineIndex: number | null;
}

// ─── WebRTC signaling — gateway event payloads ───────────────────────────────

/** Browser host → gateway: register as the capture host for this agent. */
export interface HostJoinPayload {
	agentId: string;
	/** SHA-256 hex of the session password — stored by gateway for viewer auth. */
	passwordHash: string;
}

/** Viewer → gateway: request to watch a browser-captured agent. */
export interface ViewerRequestPayload {
	agentId: string;
	viewerId: string;
	/** Plain-text password; gateway hashes and compares to the host's stored hash. */
	password: string;
	label?: string;
}

/** Host → gateway: forward SDP offer to a specific viewer. */
export interface WebRtcOfferPayload {
	agentId: string;
	viewerId: string;
	sdp: SdpDescription;
}

/** Viewer → gateway: forward SDP answer back to host. */
export interface WebRtcAnswerPayload {
	agentId: string;
	viewerId: string;
	sdp: SdpDescription;
}

/** Either side → gateway: relay an ICE candidate to the other peer. */
export interface WebRtcIcePayload {
	agentId: string;
	viewerId: string;
	candidate: IceCandidatePayload;
	/** true = sent by host → relay to viewer. false = sent by viewer → relay to host. */
	fromHost: boolean;
}

// ─── WebRTC signaling — viewer session ───────────────────────────────────────

/** A viewer currently watching an agent's screen via WebRTC. */
export interface ViewerInfo {
	viewer_id: string;
	/** Optional human-readable label (device name, etc.). */
	label?: string;
	/** ISO 8601 timestamp of when the viewer connected. */
	connected_at: string;
}

// ─── WebRTC signaling — SDP / ICE primitives ─────────────────────────────────

/** SDP offer or answer description (avoids importing browser-only RTCSessionDescriptionInit). */
export interface SdpDescription {
	type: "offer" | "answer" | "pranswer" | "rollback";
	sdp: string;
}

/** ICE candidate (avoids importing browser-only RTCIceCandidateInit). */
export interface IceCandidatePayload {
	candidate: string;
	sdpMid: string | null;
	sdpMLineIndex: number | null;
}

// ─── WebRTC signaling — gateway event payloads ───────────────────────────────

/** Browser host → gateway: register as the capture host for this agent. */
export interface HostJoinPayload {
	agentId: string;
	/** SHA-256 hex of the session password — stored by gateway for viewer auth. */
	passwordHash: string;
}

/** Viewer → gateway: request to watch a browser-captured agent. */
export interface ViewerRequestPayload {
	agentId: string;
	viewerId: string;
	/** Plain-text password; gateway hashes and compares to the host's stored hash. */
	password: string;
	label?: string;
}

/** Host → gateway: forward SDP offer to a specific viewer. */
export interface WebRtcOfferPayload {
	agentId: string;
	viewerId: string;
	sdp: SdpDescription;
}

/** Viewer → gateway: forward SDP answer back to host. */
export interface WebRtcAnswerPayload {
	agentId: string;
	viewerId: string;
	sdp: SdpDescription;
}

/** Either side → gateway: relay an ICE candidate to the other peer. */
export interface WebRtcIcePayload {
	agentId: string;
	viewerId: string;
	candidate: IceCandidatePayload;
	/** true = sent by host → relay to viewer. false = sent by viewer → relay to host. */
	fromHost: boolean;
}
