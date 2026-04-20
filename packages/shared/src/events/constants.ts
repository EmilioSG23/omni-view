// ─── Signaling event names (gateway ↔ host/viewer) ────────────────────────────

/**
 * Constant names for every WebSocket signaling event that travels through the
 * OmniView gateway.  Always import these instead of using bare string literals
 * so that renames are caught at compile time.
 *
 * Convention: `domain:action`
 */
export const SIGNALING = {
	// Host → Gateway
	HOST_JOIN: "host:join",

	// Viewer → Gateway
	VIEWER_REQUEST: "viewer:request",
	VIEWER_CONFIG: "viewer:config",

	// Gateway → Viewer
	VIEWER_PENDING: "viewer:pending",
	VIEWER_APPROVED: "viewer:approved",
	VIEWER_REJECTED: "viewer:rejected",
	VIEWER_KICKED: "viewer:kicked",

	// Gateway → Host
	VIEWER_JOINED: "viewer:joined",
	VIEWER_LEFT: "viewer:left",
	HOST_DISCONNECTED: "host:disconnected",

	// Access-request flow  (viewer ↔ gateway ↔ host)
	ACCESS_REQUEST: "access:request",
	ACCESS_REQUESTED: "access:requested",
	ACCESS_GRANT: "access:grant",
	ACCESS_GRANTED: "access:granted",
	ACCESS_DENY: "access:deny",
	ACCESS_DENIED: "access:denied",
	ACCESS_CANCELLED: "access:cancelled",

	// WebRTC signaling
	WEBRTC_OFFER: "webrtc:offer",
	WEBRTC_ANSWER: "webrtc:answer",
	WEBRTC_ICE: "webrtc:ice",
} as const;

export type SignalingEventName = (typeof SIGNALING)[keyof typeof SIGNALING];

// ─── Rust-agent / backend notification event names ────────────────────────────

/**
 * Events emitted internally by the backend to Rust-agent subscribers (not WS
 * protocol events in the gateway sense, but the payload `type` field).
 */
export const AGENT_EVENTS = {
	AGENT_ONLINE: "agent_online",
	AGENT_OFFLINE: "agent_offline",
	AGENT_REINIT: "agent_reinit",
} as const;

export type AgentEventName = (typeof AGENT_EVENTS)[keyof typeof AGENT_EVENTS];

// ─── Rust-agent ↔ Client message type names ───────────────────────────────────

/**
 * `type` field values used in the direct agent WebSocket protocol
 * (client → agent and agent → client text frames).
 */
export const AGENT_MSG = {
	// Client → Agent
	AUTH: "auth",
	CONFIG: "config",
	PAUSE: "pause",
	RESUME: "resume",

	// Agent → Client
	AUTH_OK: "auth_ok",
	AUTH_ERROR: "auth_error",
	REINIT: "reinit",
	QUALITY_CHANGED: "quality_changed",
} as const;

export type AgentMsgName = (typeof AGENT_MSG)[keyof typeof AGENT_MSG];

// ─── AgentSession local event names (browser-side emitter) ───────────────────

/**
 * Keys used by `AgentSession` (in apps/web) to emit events to UI consumers.
 */
export const SESSION_EVENTS = {
	STATE_CHANGE: "stateChange",
	BINARY_FRAME: "binaryFrame",
	MESSAGE: "message",
	ERROR: "error",
} as const;

export type SessionEventName = (typeof SESSION_EVENTS)[keyof typeof SESSION_EVENTS];
