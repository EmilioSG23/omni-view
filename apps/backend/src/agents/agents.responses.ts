// ─── Public response shapes ───────────────────────────────────────────────────
// These never expose internal fields (password_hash, ws_url, TypeORM relations).

export interface RegisterAgentResponseDto {
	agent_id: string;
	/** ISO 8601 */
	registered_at: string;
}

export interface AgentSummaryDto {
	agent_id: string;
	label: string | null;
	version: string;
	/** WebSocket URL where the agent is reachable for direct client connections. */
	ws_url: string | null;
	/** Capture mode: 'native' or 'browser'. */
	capture_mode: string | null;
	/** ISO 8601 */
	registered_at: string;
	/** ISO 8601 */
	last_seen_at: string;
}
