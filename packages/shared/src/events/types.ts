import type {
	AccessDeniedPayload,
	AccessDenyPayload,
	AccessGrantedPayload,
	AccessGrantPayload,
	AccessRequestedPayload,
	AccessRequestPayload,
} from "../types/access";
import type { AgentState } from "../types/agent";
import type { AgentToClientMessage, ClientToAgentMessage } from "../types/message";
import type {
	HostJoinPayload,
	IceCandidatePayload,
	SdpDescription,
	ViewerRequestPayload,
	WebRtcAnswerPayload,
	WebRtcIcePayload,
	WebRtcOfferPayload,
} from "../types/signaling";
import type { AGENT_EVENTS, SESSION_EVENTS, SIGNALING } from "./constants";

// ─── Re-export payload types for convenience ──────────────────────────────────

export type {
	AccessDeniedPayload,
	AccessDenyPayload,
	AccessGrantedPayload,
	AccessGrantPayload,
	AccessRequestedPayload,
	AccessRequestPayload,
	HostJoinPayload,
	IceCandidatePayload,
	SdpDescription,
	ViewerRequestPayload,
	WebRtcAnswerPayload,
	WebRtcIcePayload,
	WebRtcOfferPayload,
};

// ─── Signaling event map (gateway ↔ host/viewer) ──────────────────────────────

/**
 * Internal: associates each SIGNALING constant key with its payload type.
 * Keys here must stay in sync with the keys of `typeof SIGNALING` in constants.ts.
 * The *string values* (event names) live only in constants.ts — rename them there
 * and the rest of the type system updates automatically.
 */
type SignalingPayloads = {
	HOST_JOIN: HostJoinPayload;
	VIEWER_REQUEST: ViewerRequestPayload;
	VIEWER_CONFIG: { agentId: string; viewerId: string; preset: string };
	VIEWER_PENDING: { requestId: string };
	VIEWER_APPROVED: { requestId: string };
	VIEWER_REJECTED: { reason: "invalid_password" | "blacklisted" | "denied" | "host_not_available" };
	VIEWER_KICKED: Record<never, never>;
	VIEWER_JOINED: { viewerId: string; agentId: string; label?: string };
	VIEWER_LEFT: { viewerId: string; agentId: string };
	HOST_DISCONNECTED: { agentId: string };
	ACCESS_REQUEST: AccessRequestPayload;
	ACCESS_REQUESTED: AccessRequestedPayload;
	ACCESS_GRANT: AccessGrantPayload;
	ACCESS_GRANTED: AccessGrantedPayload;
	ACCESS_DENY: AccessDenyPayload;
	ACCESS_DENIED: AccessDeniedPayload;
	ACCESS_CANCELLED: { requestId: string };
	WEBRTC_OFFER: WebRtcOfferPayload;
	WEBRTC_ANSWER: WebRtcAnswerPayload;
	WEBRTC_ICE: WebRtcIcePayload;
};

/**
 * Maps every signaling event name to its expected payload type.
 * Keys are derived from `SIGNALING` constants — renaming a value there
 * automatically updates this map with no changes needed here.
 */
export type SignalingEventMap = {
	[K in keyof typeof SIGNALING as (typeof SIGNALING)[K]]: SignalingPayloads[K];
};

/**
 * A generic typed wrapper for a single signaling message over the wire.
 * The gateway sends/receives `{ event, data }` shaped JSON.
 */
export type SignalingMessage<E extends keyof SignalingEventMap = keyof SignalingEventMap> = {
	[K in E]: { event: K; data: SignalingEventMap[K] };
}[E];

// ─── Agent-subscriber notification event map ──────────────────────────────────

/** Internal: payload per AGENT_EVENTS key. */
type AgentNotificationPayloads = {
	AGENT_ONLINE: { type: typeof AGENT_EVENTS.AGENT_ONLINE; agentId: string };
	AGENT_OFFLINE: { type: typeof AGENT_EVENTS.AGENT_OFFLINE; agentId: string };
	AGENT_REINIT: { type: typeof AGENT_EVENTS.AGENT_REINIT; agentId: string };
};

/** Events broadcast to Rust-agent subscribers (`notifyAgentSubscribers`). */
export type AgentNotificationMap = {
	[K in keyof typeof AGENT_EVENTS as (typeof AGENT_EVENTS)[K]]: AgentNotificationPayloads[K];
};

export type AgentNotification = AgentNotificationMap[keyof AgentNotificationMap];

// ─── AgentSession event map (browser-side) ────────────────────────────────────

export type SessionState =
	| "idle"
	| "connecting"
	| "authenticating"
	| "streaming"
	| "paused"
	| "degraded"
	| "closed";

/** Internal: payload per SESSION_EVENTS key. */
type SessionPayloads = {
	STATE_CHANGE: SessionState;
	BINARY_FRAME: ArrayBuffer;
	MESSAGE: AgentToClientMessage;
	ERROR: Error;
};

/**
 * EventMap for the browser-side `AgentSession` emitter.
 * Keys are derived from `SESSION_EVENTS` constants.
 */
export type SessionEventMap = {
	[K in keyof typeof SESSION_EVENTS as (typeof SESSION_EVENTS)[K]]: SessionPayloads[K];
};

// ─── Re-export agent protocol types ───────────────────────────────────────────

export type { AgentState, AgentToClientMessage, ClientToAgentMessage };
