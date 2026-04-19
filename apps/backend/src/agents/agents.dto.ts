import { IsBoolean, IsOptional, IsString, IsUrl, IsUUID, MinLength } from "class-validator";

export class RegisterAgentDto {
	@IsUUID()
	agent_id!: string;

	@IsString()
	@IsOptional()
	label?: string;

	@IsString()
	@MinLength(1)
	version!: string;

	/**
	 * Optional WebSocket URL where the agent can be reached.
	 * Example: ws://192.168.1.5:9000
	 */
	@IsUrl({ protocols: ["ws", "wss"], require_tld: false })
	@IsOptional()
	ws_url?: string;

	/**
	 * SHA-256 hex of the agent password, so backend can auth on backend-pull mode.
	 * The agent sends this; the backend stores it to open a reverse connection.
	 */
	@IsString()
	@IsOptional()
	password_hash?: string;

	/** Capture mode: 'native' (Rust agent over ws_url) or 'browser' (WebRTC). */
	@IsString()
	@IsOptional()
	capture_mode?: string;
}

export class AddToWhitelistDto {
	@IsString()
	@MinLength(1)
	device_id!: string;

	@IsString()
	@IsOptional()
	label?: string;
}

export class CheckWhitelistQueryDto {
	@IsString()
	@MinLength(1)
	device_id!: string;
}

/** Body DTO for POST /agents/:id/connect */
export class ConnectAgentDto {
	/**
	 * Plain-text password. Backend will hash it before using it.
	 * Optional — if omitted, backend uses the stored password_hash.
	 */
	@IsString()
	@IsOptional()
	password?: string;

	/** Override ws_url without updating the agent record */
	@IsUrl({ protocols: ["ws", "wss"], require_tld: false })
	@IsOptional()
	ws_url?: string;

	/** When true, backend will persist received frames for this connect session */
	@IsBoolean()
	@IsOptional()
	persist?: boolean;
}

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
