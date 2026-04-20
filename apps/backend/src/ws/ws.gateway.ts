const PENDING_REQUEST_TIMEOUT_MS = 20000;
import { AgentsService } from "@/agents/agents.service";
import logger from "@/common/custom-logger.service";
import { Inject, forwardRef } from "@nestjs/common";
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from "@nestjs/websockets";
import type { AgentNotification, ViewerInfo } from "@omni-view/shared";
import { SIGNALING } from "@omni-view/shared";
import { createHash } from "crypto";
import { Server, WebSocket } from "ws";

interface ViewerMeta {
	agentId: string;
	viewerId: string;
	label?: string;
	connectedAt: string;
}

interface PendingRequest {
	/** "access" = came from access:request; "viewer" = came from viewer:request. */
	type: "access" | "viewer";
	agentId: string;
	deviceId: string;
	label?: string;
	viewerWs: WebSocket;
	/** Only set when type === "viewer". */
	viewerId?: string;
}

@WebSocketGateway({ path: "/api/ws" })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
	constructor(
		@Inject(forwardRef(() => AgentsService))
		private readonly agentsService: AgentsService,
	) {}

	@WebSocketServer()
	server!: Server;

	/** Agent-event subscriptions (agentId → WebSocket, for Rust-agent notifications). */
	private readonly subscriptions = new Map<WebSocket, string>();

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

	private clearPendingRequest(requestId: string): PendingRequest | undefined {
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

	private schedulePendingTimeout(requestId: string): void {
		const current = this.pendingTimeouts.get(requestId);
		if (current) clearTimeout(current);

		const timeout = setTimeout(() => {
			const pending = this.clearPendingRequest(requestId);
			if (!pending) return;

			if (pending.type === "viewer") {
				this.sendTo(pending.viewerWs, {
					event: SIGNALING.VIEWER_REJECTED,
					reason: "approval_timeout",
				});
			} else {
				this.sendTo(pending.viewerWs, {
					event: SIGNALING.ACCESS_DENIED,
					requestId,
					reason: "approval_timeout",
				});
			}
		}, PENDING_REQUEST_TIMEOUT_MS);

		this.pendingTimeouts.set(requestId, timeout);
	}

	private registerViewerSocket(client: WebSocket, meta: ViewerMeta): void {
		for (const [existingWs, existingMeta] of this.viewerSockets) {
			if (
				existingWs !== client &&
				existingMeta.agentId === meta.agentId &&
				existingMeta.viewerId === meta.viewerId
			) {
				this.viewerSockets.delete(existingWs);
				const pendingId = this.pendingBySocket.get(existingWs);
				if (pendingId) {
					this.clearPendingRequest(pendingId);
				}
				if (
					existingWs.readyState === WebSocket.OPEN ||
					existingWs.readyState === WebSocket.CONNECTING
				) {
					existingWs.close();
				}
			}
		}

		this.viewerSockets.set(client, meta);
	}

	private sendTo(ws: WebSocket, payload: Record<string, unknown>): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(payload));
		}
	}

	handleConnection(_client: WebSocket): void {
		// No-op; state is set by subsequent subscription messages.
	}

	handleDisconnect(client: WebSocket): void {
		this.subscriptions.delete(client);

		// Clean up any pending access/viewer request for this viewer.
		const pendingRequestId = this.pendingBySocket.get(client);
		if (pendingRequestId) {
			const pending = this.clearPendingRequest(pendingRequestId);
			if (pending) {
				const hostWs = this.hostSockets.get(pending.agentId);
				if (hostWs) {
					this.sendTo(hostWs, { event: SIGNALING.ACCESS_CANCELLED, requestId: pendingRequestId });
				}
			}
		}

		// Clean up if disconnected client was a host.
		for (const [agentId, hostWs] of this.hostSockets) {
			if (hostWs === client) {
				this.hostSockets.delete(agentId);
				this.hostPasswords.delete(agentId);
				for (const [viewerWs, meta] of this.viewerSockets) {
					if (meta.agentId === agentId) {
						this.sendTo(viewerWs, { event: SIGNALING.HOST_DISCONNECTED, agentId });
					}
				}
				break;
			}
		}

		// Clean up if disconnected client was a viewer.
		const viewerMeta = this.viewerSockets.get(client);
		if (viewerMeta) {
			this.viewerSockets.delete(client);
			const hostWs = this.hostSockets.get(viewerMeta.agentId);
			if (hostWs) {
				this.sendTo(hostWs, {
					event: SIGNALING.VIEWER_LEFT,
					viewerId: viewerMeta.viewerId,
					agentId: viewerMeta.agentId,
				});
			}
		}
	}

	// ─── Rust-agent event subscriptions ───────────────────────────────────────

	@SubscribeMessage("subscribe")
	handleSubscribe(@ConnectedSocket() client: WebSocket, @MessageBody() agentId: string): void {
		this.subscriptions.set(client, agentId);
	}

	@SubscribeMessage("unsubscribe")
	handleUnsubscribe(@ConnectedSocket() client: WebSocket): void {
		this.subscriptions.delete(client);
	}

	// ─── WebRTC signaling ──────────────────────────────────────────────────────

	/** Browser host registers as the capture source for an agent. */
	@SubscribeMessage(SIGNALING.HOST_JOIN)
	handleHostJoin(
		@ConnectedSocket() client: WebSocket,
		@MessageBody() payload: { agentId: string; passwordHash: string },
	): void {
		logger.info(`[WS] host:join received, agentId: ${payload.agentId}`);
		this.hostSockets.set(payload.agentId, client);
		this.hostPasswords.set(payload.agentId, payload.passwordHash);
		logger.debug(`[WS] hostSockets keys: ${JSON.stringify([...this.hostSockets.keys()])}`);
	}

	/** Viewer requests to watch a browser-captured agent. */
	@SubscribeMessage(SIGNALING.VIEWER_REQUEST)
	async handleViewerRequest(
		@ConnectedSocket() client: WebSocket,
		@MessageBody() payload: { agentId: string; viewerId: string; password: string; label?: string },
	): Promise<void> {
		logger.info(
			`[WS] viewer:request received, agentId: ${payload.agentId}, viewerId: ${payload.viewerId}`,
		);
		logger.debug(
			`[WS] hostSockets keys at request time: ${JSON.stringify([...this.hostSockets.keys()])}`,
		);
		const storedHash = this.hostPasswords.get(payload.agentId);
		if (storedHash) {
			const attemptHash = createHash("sha256").update(payload.password).digest("hex");
			if (attemptHash !== storedHash) {
				this.sendTo(client, { event: SIGNALING.VIEWER_REJECTED, reason: "invalid_password" });
				return;
			}
		}

		// Host is not connected yet; reject immediately.
		if (!this.hostSockets.has(payload.agentId)) {
			this.sendTo(client, { event: SIGNALING.VIEWER_REJECTED, reason: "host_not_available" });
			return;
		}

		// Reject blacklisted viewers immediately.
		const isBlocked = await this.agentsService
			.isBlacklisted(payload.agentId, payload.viewerId)
			.catch(() => false);
		if (isBlocked) {
			this.sendTo(client, { event: SIGNALING.VIEWER_REJECTED, reason: "blacklisted" });
			return;
		}

		const hostWs = this.hostSockets.get(payload.agentId);
		if (!hostWs) {
			this.sendTo(client, { event: SIGNALING.VIEWER_REJECTED, reason: "host_not_available" });
			return;
		}

		// If the viewer is already whitelisted, let them in directly.
		const isAllowed = await this.agentsService
			.isWhitelisted(payload.agentId, payload.viewerId)
			.catch(() => false);
		if (isAllowed) {
			this.registerViewerSocket(client, {
				agentId: payload.agentId,
				viewerId: payload.viewerId,
				label: payload.label,
				connectedAt: new Date().toISOString(),
			});
			this.sendTo(hostWs, {
				event: SIGNALING.VIEWER_JOINED,
				viewerId: payload.viewerId,
				label: payload.label,
				agentId: payload.agentId,
			});
			return;
		}

		// Viewer is not whitelisted — ask the host for approval.
		const requestId = `viewer-${payload.viewerId}-${Date.now().toString(36)}`;
		this.pendingRequests.set(requestId, {
			type: "viewer",
			agentId: payload.agentId,
			deviceId: payload.viewerId,
			viewerId: payload.viewerId,
			label: payload.label,
			viewerWs: client,
		});
		this.pendingBySocket.set(client, requestId);
		this.schedulePendingTimeout(requestId);

		this.sendTo(client, { event: SIGNALING.VIEWER_PENDING, requestId });
		this.sendTo(hostWs, {
			event: SIGNALING.ACCESS_REQUESTED,
			requestId,
			deviceId: payload.viewerId,
			label: payload.label,
		});
	}

	/** Viewer sends an access request to the host (whitelist-gated flow). */
	@SubscribeMessage(SIGNALING.ACCESS_REQUEST)
	async handleAccessRequest(
		@ConnectedSocket() client: WebSocket,
		@MessageBody()
		payload: { requestId: string; agentId: string; deviceId: string; label?: string },
	): Promise<void> {
		// If already blacklisted, deny immediately.
		const isBlocked = await this.agentsService
			.isBlacklisted(payload.agentId, payload.deviceId)
			.catch(() => false);
		if (isBlocked) {
			this.sendTo(client, {
				event: SIGNALING.ACCESS_DENIED,
				requestId: payload.requestId,
				blacklisted: true,
			});
			return;
		}

		// If already whitelisted, grant immediately.
		const isAllowed = await this.agentsService
			.isWhitelisted(payload.agentId, payload.deviceId)
			.catch(() => false);
		if (isAllowed) {
			this.sendTo(client, { event: SIGNALING.ACCESS_GRANTED, requestId: payload.requestId });
			return;
		}

		const hostWs = this.hostSockets.get(payload.agentId);
		if (!hostWs) {
			this.sendTo(client, {
				event: SIGNALING.ACCESS_DENIED,
				requestId: payload.requestId,
				reason: "host_not_available",
			});
			return;
		}

		this.pendingRequests.set(payload.requestId, {
			type: "access",
			agentId: payload.agentId,
			deviceId: payload.deviceId,
			label: payload.label,
			viewerWs: client,
		});
		this.pendingBySocket.set(client, payload.requestId);
		this.schedulePendingTimeout(payload.requestId);

		this.sendTo(hostWs, {
			event: SIGNALING.ACCESS_REQUESTED,
			requestId: payload.requestId,
			deviceId: payload.deviceId,
			label: payload.label,
		});
	}

	/** Host grants a pending access request. */
	@SubscribeMessage(SIGNALING.ACCESS_GRANT)
	async handleAccessGrant(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody() payload: { requestId: string; agentId: string },
	): Promise<void> {
		const pending = this.clearPendingRequest(payload.requestId);
		if (!pending) return;

		// Auto-whitelist the device.
		await this.agentsService
			.addToWhitelist(payload.agentId, { device_id: pending.deviceId, label: pending.label })
			.catch(() => null);

		if (pending.type === "viewer") {
			// Complete the viewer:request join now that the host approved.
			const hostWs = this.hostSockets.get(pending.agentId);
			if (!hostWs) {
				this.sendTo(pending.viewerWs, {
					event: SIGNALING.VIEWER_REJECTED,
					reason: "host_not_available",
				});
				return;
			}
			this.registerViewerSocket(pending.viewerWs, {
				agentId: pending.agentId,
				viewerId: pending.viewerId!,
				label: pending.label,
				connectedAt: new Date().toISOString(),
			});
			this.sendTo(pending.viewerWs, {
				event: SIGNALING.VIEWER_APPROVED,
				requestId: payload.requestId,
			});
			this.sendTo(hostWs, {
				event: SIGNALING.VIEWER_JOINED,
				viewerId: pending.viewerId,
				label: pending.label,
				agentId: pending.agentId,
			});
		} else {
			this.sendTo(pending.viewerWs, {
				event: SIGNALING.ACCESS_GRANTED,
				requestId: payload.requestId,
			});
		}
	}

	/** Host denies a pending access request. */
	@SubscribeMessage(SIGNALING.ACCESS_DENY)
	async handleAccessDeny(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody() payload: { requestId: string; agentId: string; blacklist?: boolean },
	): Promise<void> {
		const pending = this.clearPendingRequest(payload.requestId);
		if (!pending) return;

		if (payload.blacklist) {
			await this.agentsService
				.addToBlacklist(payload.agentId, { device_id: pending.deviceId, label: pending.label })
				.catch(() => null);
		}

		if (pending.type === "viewer") {
			this.sendTo(pending.viewerWs, {
				event: SIGNALING.VIEWER_REJECTED,
				reason: payload.blacklist ? "blacklisted" : "denied",
			});
		} else {
			this.sendTo(pending.viewerWs, {
				event: SIGNALING.ACCESS_DENIED,
				requestId: payload.requestId,
				blacklisted: !!payload.blacklist,
			});
		}
	}

	/** Host sends SDP offer to a specific viewer. */
	@SubscribeMessage(SIGNALING.WEBRTC_OFFER)
	handleOffer(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody() payload: { agentId: string; viewerId: string; sdp: unknown },
	): void {
		for (const [viewerWs, meta] of this.viewerSockets) {
			if (meta.agentId === payload.agentId && meta.viewerId === payload.viewerId) {
				this.sendTo(viewerWs, {
					event: SIGNALING.WEBRTC_OFFER,
					agentId: payload.agentId,
					sdp: payload.sdp,
				});
				return;
			}
		}
	}

	/** Viewer sends SDP answer back to host. */
	@SubscribeMessage(SIGNALING.WEBRTC_ANSWER)
	handleAnswer(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody() payload: { agentId: string; viewerId: string; sdp: unknown },
	): void {
		const hostWs = this.hostSockets.get(payload.agentId);
		if (hostWs) {
			this.sendTo(hostWs, {
				event: SIGNALING.WEBRTC_ANSWER,
				viewerId: payload.viewerId,
				agentId: payload.agentId,
				sdp: payload.sdp,
			});
		}
	}

	/** Either side relays an ICE candidate to the other peer. */
	@SubscribeMessage(SIGNALING.WEBRTC_ICE)
	handleIce(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody()
		payload: { agentId: string; viewerId: string; candidate: unknown; fromHost: boolean },
	): void {
		if (payload.fromHost) {
			for (const [viewerWs, meta] of this.viewerSockets) {
				if (meta.agentId === payload.agentId && meta.viewerId === payload.viewerId) {
					this.sendTo(viewerWs, {
						event: SIGNALING.WEBRTC_ICE,
						agentId: payload.agentId,
						candidate: payload.candidate,
					});
					return;
				}
			}
		} else {
			const hostWs = this.hostSockets.get(payload.agentId);
			if (hostWs) {
				this.sendTo(hostWs, {
					event: SIGNALING.WEBRTC_ICE,
					viewerId: payload.viewerId,
					agentId: payload.agentId,
					candidate: payload.candidate,
				});
			}
		}
	}

	/** Viewer requests a quality change; the gateway validates the sender and forwards to the host. */
	@SubscribeMessage(SIGNALING.VIEWER_CONFIG)
	handleViewerConfig(
		@ConnectedSocket() client: WebSocket,
		@MessageBody() payload: { agentId: string; viewerId: string; preset: string },
	): void {
		// Only forward if the sender is actually a registered viewer for this agent.
		const meta = this.viewerSockets.get(client);
		if (!meta || meta.agentId !== payload.agentId) return;

		const hostWs = this.hostSockets.get(payload.agentId);
		if (hostWs) {
			this.sendTo(hostWs, {
				event: SIGNALING.VIEWER_CONFIG,
				viewerId: payload.viewerId,
				preset: payload.preset,
			});
		}
	}

	// ─── Public helpers ────────────────────────────────────────────────────────

	/** Kick a viewer by closing their connection. */
	kickViewer(agentId: string, viewerId: string): void {
		for (const [viewerWs, meta] of this.viewerSockets) {
			if (meta.agentId === agentId && meta.viewerId === viewerId) {
				this.sendTo(viewerWs, { event: SIGNALING.VIEWER_KICKED });
				viewerWs.close();
				this.viewerSockets.delete(viewerWs);
				const hostWs = this.hostSockets.get(agentId);
				if (hostWs) {
					this.sendTo(hostWs, { event: SIGNALING.VIEWER_LEFT, viewerId, agentId });
				}
				return;
			}
		}
	}

	/** Return currently connected viewers for an agent. */
	getViewers(agentId: string): ViewerInfo[] {
		const byViewerId = new Map<string, ViewerInfo>();
		for (const meta of this.viewerSockets.values()) {
			if (meta.agentId === agentId) {
				const prev = byViewerId.get(meta.viewerId);
				if (!prev || prev.connected_at < meta.connectedAt) {
					byViewerId.set(meta.viewerId, {
						viewer_id: meta.viewerId,
						label: meta.label,
						connected_at: meta.connectedAt,
					});
				}
			}
		}
		return [...byViewerId.values()];
	}

	/** Notify all Rust-agent subscribers of a state change. */
	notifyAgentSubscribers(agentId: string, event: AgentNotification): void {
		const message = JSON.stringify(event);
		for (const [ws, id] of this.subscriptions) {
			if (id === agentId && ws.readyState === WebSocket.OPEN) {
				ws.send(message);
			}
		}
	}
}
