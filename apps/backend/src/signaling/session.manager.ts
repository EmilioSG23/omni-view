import { Injectable } from "@nestjs/common";
import { WebSocket } from "ws";

export interface ViewerMeta {
	agentId: string;
	viewerId: string;
	label?: string;
	connectedAt: string;
}

export interface PendingRequest {
	/** "access" = came from access:request; "viewer" = came from viewer:request. */
	type: "access" | "viewer";
	agentId: string;
	deviceId: string;
	label?: string;
	viewerWs: WebSocket;
	/** Only set when type === "viewer". */
	viewerId?: string;
}

@Injectable()
export class SessionManager {
	/** WebRTC: agentId → host WebSocket (browser capture hosts). */
	private readonly hostSockets = new Map<string, WebSocket>();

	/** WebRTC: agentId → SHA-256 password hash set by host on join. */
	private readonly hostPasswords = new Map<string, string>();

	/** WebRTC: viewer WebSocket → viewer metadata. */
	private readonly viewerSockets = new Map<WebSocket, ViewerMeta>();

	/** Access requests: requestId → pending request metadata. */
	private readonly pendingRequests = new Map<string, PendingRequest>();

	/** Access requests: viewer WebSocket → requestId (for cleanup on disconnect). */
	private readonly pendingBySocket = new Map<WebSocket, string>();

	/** Timeout handles for pending approvals by requestId. */
	private readonly pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	/** Rust-agent event subscriptions: WebSocket → agentId. */
	private readonly subscriptions = new Map<WebSocket, string>();

	// ─── Host ─────────────────────────────────────────────────────────────────

	setHost(agentId: string, ws: WebSocket, passwordHash: string): void {
		this.hostSockets.set(agentId, ws);
		this.hostPasswords.set(agentId, passwordHash);
	}

	getHostSocket(agentId: string): WebSocket | undefined {
		return this.hostSockets.get(agentId);
	}

	getHostPasswordHash(agentId: string): string | undefined {
		return this.hostPasswords.get(agentId);
	}

	hasHost(agentId: string): boolean {
		return this.hostSockets.has(agentId);
	}

	/** Remove a host by WS reference. Returns the agentId if found. */
	deleteHostBySocket(ws: WebSocket): string | undefined {
		for (const [agentId, hostWs] of this.hostSockets) {
			if (hostWs === ws) {
				this.hostSockets.delete(agentId);
				this.hostPasswords.delete(agentId);
				return agentId;
			}
		}
		return undefined;
	}

	// ─── Viewers ──────────────────────────────────────────────────────────────

	/**
	 * Register a viewer socket. If the same (agentId, viewerId) pair already
	 * exists on a different socket, the old socket is closed and its state
	 * cleaned up first (de-duplication).
	 */
	registerViewerSocket(ws: WebSocket, meta: ViewerMeta): WebSocket[] {
		const evicted: WebSocket[] = [];

		for (const [existingWs, existingMeta] of this.viewerSockets) {
			if (
				existingWs !== ws &&
				existingMeta.agentId === meta.agentId &&
				existingMeta.viewerId === meta.viewerId
			) {
				this.viewerSockets.delete(existingWs);
				const pendingId = this.pendingBySocket.get(existingWs);
				if (pendingId) {
					this.clearPendingRequest(pendingId);
				}
				evicted.push(existingWs);
			}
		}

		this.viewerSockets.set(ws, meta);
		return evicted;
	}

	getViewerMeta(ws: WebSocket): ViewerMeta | undefined {
		return this.viewerSockets.get(ws);
	}

	deleteViewerSocket(ws: WebSocket): void {
		this.viewerSockets.delete(ws);
	}

	/** All viewer sockets for a given agentId. */
	getViewerSocketsForAgent(agentId: string): Array<{ ws: WebSocket; meta: ViewerMeta }> {
		const result: Array<{ ws: WebSocket; meta: ViewerMeta }> = [];
		for (const [ws, meta] of this.viewerSockets) {
			if (meta.agentId === agentId) result.push({ ws, meta });
		}
		return result;
	}

	/** Find a viewer socket by agentId + viewerId. */
	findViewerSocket(agentId: string, viewerId: string): WebSocket | undefined {
		for (const [ws, meta] of this.viewerSockets) {
			if (meta.agentId === agentId && meta.viewerId === viewerId) return ws;
		}
		return undefined;
	}

	// ─── Pending requests ─────────────────────────────────────────────────────

	setPendingRequest(requestId: string, pending: PendingRequest): void {
		this.pendingRequests.set(requestId, pending);
		this.pendingBySocket.set(pending.viewerWs, requestId);
	}

	getPendingRequest(requestId: string): PendingRequest | undefined {
		return this.pendingRequests.get(requestId);
	}

	getPendingRequestIdBySocket(ws: WebSocket): string | undefined {
		return this.pendingBySocket.get(ws);
	}

	/** Remove a pending request and cancel its timeout. Returns the removed entry. */
	clearPendingRequest(requestId: string): PendingRequest | undefined {
		const pending = this.pendingRequests.get(requestId);
		if (!pending) return undefined;

		this.pendingRequests.delete(requestId);
		this.pendingBySocket.delete(pending.viewerWs);

		const timeout = this.pendingTimeouts.get(requestId);
		if (timeout) {
			clearTimeout(timeout);
			this.pendingTimeouts.delete(requestId);
		}

		return pending;
	}

	setPendingTimeout(requestId: string, handle: ReturnType<typeof setTimeout>): void {
		const current = this.pendingTimeouts.get(requestId);
		if (current) clearTimeout(current);
		this.pendingTimeouts.set(requestId, handle);
	}

	// ─── Rust-agent subscriptions ─────────────────────────────────────────────

	subscribe(ws: WebSocket, agentId: string): void {
		this.subscriptions.set(ws, agentId);
	}

	unsubscribe(ws: WebSocket): void {
		this.subscriptions.delete(ws);
	}

	getSubscriptions(): Map<WebSocket, string> {
		return this.subscriptions;
	}

	/** Remove all state for a disconnecting socket. Returns cleanup context. */
	cleanupSocket(ws: WebSocket): {
		pendingRequestId: string | undefined;
		pendingRequest: PendingRequest | undefined;
		evictedAgentId: string | undefined;
		viewerMeta: ViewerMeta | undefined;
	} {
		this.subscriptions.delete(ws);

		const pendingRequestId = this.pendingBySocket.get(ws);
		const pendingRequest = pendingRequestId
			? this.clearPendingRequest(pendingRequestId)
			: undefined;

		const evictedAgentId = this.deleteHostBySocket(ws);

		const viewerMeta = this.viewerSockets.get(ws);
		if (viewerMeta) {
			this.viewerSockets.delete(ws);
		}

		return { pendingRequestId, pendingRequest, evictedAgentId, viewerMeta };
	}
}
