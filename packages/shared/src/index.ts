/**
 * OmniView shared protocol types and DTOs.
 * Used by backend and client apps for type-safe communication.
 */

// ─── Quality Presets ─────────────────────────────────────────────────────────

export type QualityPreset = "performance" | "balanced" | "quality" | "custom";

export interface QualityConfig {
	fps: number;
	/** JPEG quality 1–100 */
	quality: number;
}

export const QUALITY_PRESETS: Record<Exclude<QualityPreset, "custom">, QualityConfig> = {
	performance: { fps: 5, quality: 40 },
	balanced: { fps: 10, quality: 60 },
	quality: { fps: 15, quality: 80 },
};

// ─── Agent States ─────────────────────────────────────────────────────────────

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
