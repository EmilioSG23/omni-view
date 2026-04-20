// ─── Agent States ─────────────────────────────────────────────────────────────

import { CaptureMode } from "./capture";

/**
 * Represents the logical state of the agent session as seen by the client.
 *
 * States emitted by the agent at runtime: `"idle"`, `"connecting"`, `"streaming"`, `"paused"`.
 * `"degraded"` is a **client-derived** state — the frontend infers it from
 * missing segments, repeated `reinit` events, or excessive reconnect attempts.
 * The agent binary never emits this state directly.
 */
export type AgentState = "idle" | "connecting" | "streaming" | "paused" | "degraded";

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

/** Response for GET /api/agents/:id/status */
export interface AgentStatusResponse {
	/** The agent UUID. */
	agentId: string;
	/** Whether the backend currently has an open connection to this agent. */
	connected: boolean;
}
