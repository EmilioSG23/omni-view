import { QualityConfig, QualityPreset } from "./quality";

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
