// ─── Access request flow — WS event payloads ─────────────────────────────────

/** Viewer → gateway: request access to view an agent. */
export interface AccessRequestPayload {
	requestId: string;
	agentId: string;
	deviceId: string;
	label?: string;
}

/** Gateway → host: a viewer is requesting access. */
export interface AccessRequestedPayload {
	requestId: string;
	deviceId: string;
	label?: string;
}

/** Host → gateway: grant a pending access request. */
export interface AccessGrantPayload {
	requestId: string;
	agentId: string;
}

/** Host → gateway: deny a pending access request. */
export interface AccessDenyPayload {
	requestId: string;
	agentId: string;
	blacklist?: boolean;
}

/** Gateway → viewer: access was granted. */
export interface AccessGrantedPayload {
	requestId: string;
}

/** Gateway → viewer: access was denied. */
export interface AccessDeniedPayload {
	requestId: string;
	blacklisted?: boolean;
	reason?: string;
}
