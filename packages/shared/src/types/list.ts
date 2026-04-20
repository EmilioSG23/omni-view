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

// ─── Backend REST API — Blacklist ─────────────────────────────────────────────

export interface AddToBlacklistDto {
	device_id: string;
	label?: string;
}

export interface BlacklistEntry {
	id: string;
	agent_id: string;
	device_id: string;
	label?: string;
	created_at: string;
}

export interface CheckBlacklistResponse {
	blocked: boolean;
}
