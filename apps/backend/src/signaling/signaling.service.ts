const PENDING_REQUEST_TIMEOUT_MS = 20_000;

import { AgentsService } from "@/agents/agents.service";
import logger from "@/common/custom-logger.service";
import type { AccessDenyDto } from "@/signaling/dto/access-deny.dto";
import type { AccessGrantDto } from "@/signaling/dto/access-grant.dto";
import type { AccessRequestDto } from "@/signaling/dto/access-request.dto";
import type { HostJoinDto } from "@/signaling/dto/host-join.dto";
import type { ViewerConfigDto } from "@/signaling/dto/viewer-config.dto";
import type { ViewerRequestDto } from "@/signaling/dto/viewer-request.dto";
import type { WebRtcAnswerDto, WebRtcIceDto, WebRtcOfferDto } from "@/signaling/dto/webrtc.dto";
import type { PendingRequest } from "@/signaling/session.manager";
import { SessionManager } from "@/signaling/session.manager";
import { Inject, Injectable, forwardRef } from "@nestjs/common";
import type { AgentNotification, ViewerInfo } from "@omni-view/shared";
import { SIGNALING } from "@omni-view/shared";
import { createHash } from "node:crypto";
import { WebSocket } from "ws";

@Injectable()
export class SignalingService {
	constructor(
		private readonly sessions: SessionManager,
		@Inject(forwardRef(() => AgentsService))
		private readonly agentsService: AgentsService,
	) {}

	// ─── Internal helpers ──────────────────────────────────────────────────────

	sendTo(ws: WebSocket, payload: Record<string, unknown>): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(payload));
		}
	}

	private schedulePendingTimeout(requestId: string, pending: PendingRequest): void {
		const handle = setTimeout(() => {
			const expired = this.sessions.clearPendingRequest(requestId);
			if (!expired) return;

			if (expired.type === "viewer") {
				this.sendTo(expired.viewerWs, {
					event: SIGNALING.VIEWER_REJECTED,
					reason: "approval_timeout",
				});
			} else {
				this.sendTo(expired.viewerWs, {
					event: SIGNALING.ACCESS_DENIED,
					requestId,
					reason: "approval_timeout",
				});
			}
		}, PENDING_REQUEST_TIMEOUT_MS);

		this.sessions.setPendingTimeout(requestId, handle);
	}

	// ─── Connection lifecycle ──────────────────────────────────────────────────

	handleConnect(_client: WebSocket): void {
		// No-op; state is set by subsequent subscription messages.
	}

	handleDisconnect(client: WebSocket): void {
		const { pendingRequestId, pendingRequest, evictedAgentId, viewerMeta } =
			this.sessions.cleanupSocket(client);

		// Notify host if a viewer was pending approval and cancelled.
		if (pendingRequestId && pendingRequest) {
			const hostWs = this.sessions.getHostSocket(pendingRequest.agentId);
			if (hostWs) {
				this.sendTo(hostWs, {
					event: SIGNALING.ACCESS_CANCELLED,
					requestId: pendingRequestId,
				});
			}
		}

		// If a host disconnected, notify all its viewers.
		if (evictedAgentId) {
			for (const { ws: viewerWs } of this.sessions.getViewerSocketsForAgent(evictedAgentId)) {
				this.sendTo(viewerWs, {
					event: SIGNALING.HOST_DISCONNECTED,
					agentId: evictedAgentId,
				});
			}
		}

		// If a viewer disconnected, notify the host.
		if (viewerMeta) {
			const hostWs = this.sessions.getHostSocket(viewerMeta.agentId);
			if (hostWs) {
				this.sendTo(hostWs, {
					event: SIGNALING.VIEWER_LEFT,
					viewerId: viewerMeta.viewerId,
					agentId: viewerMeta.agentId,
				});
			}
		}
	}

	// ─── Rust-agent subscriptions ──────────────────────────────────────────────

	handleSubscribe(client: WebSocket, agentId: string): void {
		this.sessions.subscribe(client, agentId);
	}

	handleUnsubscribe(client: WebSocket): void {
		this.sessions.unsubscribe(client);
	}

	// ─── WebRTC signaling ──────────────────────────────────────────────────────

	handleHostJoin(client: WebSocket, dto: HostJoinDto): void {
		logger.info(`[Signaling] host:join agentId=${dto.agentId}`, "SignalingService");
		this.sessions.setHost(dto.agentId, client, dto.passwordHash);
	}

	async handleViewerRequest(client: WebSocket, dto: ViewerRequestDto): Promise<void> {
		logger.info(
			`[Signaling] viewer:request agentId=${dto.agentId} viewerId=${dto.viewerId}`,
			"SignalingService",
		);

		// Validate password when host has one set.
		const storedHash = this.sessions.getHostPasswordHash(dto.agentId);
		if (storedHash) {
			const attemptHash = createHash("sha256").update(dto.password).digest("hex");
			if (attemptHash !== storedHash) {
				this.sendTo(client, { event: SIGNALING.VIEWER_REJECTED, reason: "invalid_password" });
				return;
			}
		}

		// Reject if host not connected.
		if (!this.sessions.hasHost(dto.agentId)) {
			this.sendTo(client, { event: SIGNALING.VIEWER_REJECTED, reason: "host_not_available" });
			return;
		}

		// Reject blacklisted viewers.
		const isBlocked = await this.agentsService
			.isBlacklisted(dto.agentId, dto.viewerId)
			.catch(() => false);
		if (isBlocked) {
			this.sendTo(client, { event: SIGNALING.VIEWER_REJECTED, reason: "blacklisted" });
			return;
		}

		const hostWs = this.sessions.getHostSocket(dto.agentId);
		if (!hostWs) {
			this.sendTo(client, { event: SIGNALING.VIEWER_REJECTED, reason: "host_not_available" });
			return;
		}

		// If already whitelisted, let the viewer in directly.
		const isAllowed = await this.agentsService
			.isWhitelisted(dto.agentId, dto.viewerId)
			.catch(() => false);
		if (isAllowed) {
			const evicted = this.sessions.registerViewerSocket(client, {
				agentId: dto.agentId,
				viewerId: dto.viewerId,
				label: dto.label,
				connectedAt: new Date().toISOString(),
			});
			this.closeEvictedSockets(evicted);
			this.sendTo(hostWs, {
				event: SIGNALING.VIEWER_JOINED,
				viewerId: dto.viewerId,
				label: dto.label,
				agentId: dto.agentId,
			});
			return;
		}

		// Ask host for approval.
		const requestId = `viewer-${dto.viewerId}-${Date.now().toString(36)}`;
		const pending: PendingRequest = {
			type: "viewer",
			agentId: dto.agentId,
			deviceId: dto.viewerId,
			viewerId: dto.viewerId,
			label: dto.label,
			viewerWs: client,
		};
		this.sessions.setPendingRequest(requestId, pending);
		this.schedulePendingTimeout(requestId, pending);

		this.sendTo(client, { event: SIGNALING.VIEWER_PENDING, requestId });
		this.sendTo(hostWs, {
			event: SIGNALING.ACCESS_REQUESTED,
			requestId,
			deviceId: dto.viewerId,
			label: dto.label,
		});
	}

	async handleAccessRequest(client: WebSocket, dto: AccessRequestDto): Promise<void> {
		// Deny immediately if already blacklisted.
		const isBlocked = await this.agentsService
			.isBlacklisted(dto.agentId, dto.deviceId)
			.catch(() => false);
		if (isBlocked) {
			this.sendTo(client, {
				event: SIGNALING.ACCESS_DENIED,
				requestId: dto.requestId,
				blacklisted: true,
			});
			return;
		}

		// Grant immediately if already whitelisted.
		const isAllowed = await this.agentsService
			.isWhitelisted(dto.agentId, dto.deviceId)
			.catch(() => false);
		if (isAllowed) {
			this.sendTo(client, { event: SIGNALING.ACCESS_GRANTED, requestId: dto.requestId });
			return;
		}

		const hostWs = this.sessions.getHostSocket(dto.agentId);
		if (!hostWs) {
			this.sendTo(client, {
				event: SIGNALING.ACCESS_DENIED,
				requestId: dto.requestId,
				reason: "host_not_available",
			});
			return;
		}

		const pending: PendingRequest = {
			type: "access",
			agentId: dto.agentId,
			deviceId: dto.deviceId,
			label: dto.label,
			viewerWs: client,
		};
		this.sessions.setPendingRequest(dto.requestId, pending);
		this.schedulePendingTimeout(dto.requestId, pending);

		this.sendTo(hostWs, {
			event: SIGNALING.ACCESS_REQUESTED,
			requestId: dto.requestId,
			deviceId: dto.deviceId,
			label: dto.label,
		});
	}

	async handleAccessGrant(dto: AccessGrantDto): Promise<void> {
		const pending = this.sessions.clearPendingRequest(dto.requestId);
		if (!pending) return;

		await this.agentsService
			.addToWhitelist(dto.agentId, { device_id: pending.deviceId, label: pending.label })
			.catch(() => null);

		if (pending.type === "viewer") {
			const hostWs = this.sessions.getHostSocket(pending.agentId);
			if (!hostWs) {
				this.sendTo(pending.viewerWs, {
					event: SIGNALING.VIEWER_REJECTED,
					reason: "host_not_available",
				});
				return;
			}
			const evicted = this.sessions.registerViewerSocket(pending.viewerWs, {
				agentId: pending.agentId,
				viewerId: pending.viewerId!,
				label: pending.label,
				connectedAt: new Date().toISOString(),
			});
			this.closeEvictedSockets(evicted);
			this.sendTo(pending.viewerWs, {
				event: SIGNALING.VIEWER_APPROVED,
				requestId: dto.requestId,
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
				requestId: dto.requestId,
			});
		}
	}

	async handleAccessDeny(dto: AccessDenyDto): Promise<void> {
		const pending = this.sessions.clearPendingRequest(dto.requestId);
		if (!pending) return;

		if (dto.blacklist) {
			await this.agentsService
				.addToBlacklist(dto.agentId, { device_id: pending.deviceId, label: pending.label })
				.catch(() => null);
		}

		if (pending.type === "viewer") {
			this.sendTo(pending.viewerWs, {
				event: SIGNALING.VIEWER_REJECTED,
				reason: dto.blacklist ? "blacklisted" : "denied",
			});
		} else {
			this.sendTo(pending.viewerWs, {
				event: SIGNALING.ACCESS_DENIED,
				requestId: dto.requestId,
				blacklisted: !!dto.blacklist,
			});
		}
	}

	handleOffer(dto: WebRtcOfferDto): void {
		const viewerWs = this.sessions.findViewerSocket(dto.agentId, dto.viewerId);
		if (viewerWs) {
			this.sendTo(viewerWs, {
				event: SIGNALING.WEBRTC_OFFER,
				agentId: dto.agentId,
				sdp: dto.sdp,
			});
		}
	}

	handleAnswer(dto: WebRtcAnswerDto): void {
		const hostWs = this.sessions.getHostSocket(dto.agentId);
		if (hostWs) {
			this.sendTo(hostWs, {
				event: SIGNALING.WEBRTC_ANSWER,
				viewerId: dto.viewerId,
				agentId: dto.agentId,
				sdp: dto.sdp,
			});
		}
	}

	handleIce(client: WebSocket, dto: WebRtcIceDto): void {
		if (dto.fromHost) {
			const viewerWs = this.sessions.findViewerSocket(dto.agentId, dto.viewerId);
			if (viewerWs) {
				this.sendTo(viewerWs, {
					event: SIGNALING.WEBRTC_ICE,
					agentId: dto.agentId,
					candidate: dto.candidate,
				});
			}
		} else {
			const hostWs = this.sessions.getHostSocket(dto.agentId);
			if (hostWs) {
				this.sendTo(hostWs, {
					event: SIGNALING.WEBRTC_ICE,
					viewerId: dto.viewerId,
					agentId: dto.agentId,
					candidate: dto.candidate,
				});
			}
		}
	}

	handleViewerConfig(client: WebSocket, dto: ViewerConfigDto): void {
		// Only forward if the sender is actually a registered viewer for this agent.
		const meta = this.sessions.getViewerMeta(client);
		if (!meta || meta.agentId !== dto.agentId) return;

		const hostWs = this.sessions.getHostSocket(dto.agentId);
		if (hostWs) {
			this.sendTo(hostWs, {
				event: SIGNALING.VIEWER_CONFIG,
				viewerId: dto.viewerId,
				preset: dto.preset,
			});
		}
	}

	// ─── Public API ────────────────────────────────────────────────────────────

	kickViewer(agentId: string, viewerId: string): void {
		const viewerWs = this.sessions.findViewerSocket(agentId, viewerId);
		if (!viewerWs) return;

		this.sendTo(viewerWs, { event: SIGNALING.VIEWER_KICKED });
		viewerWs.close();
		this.sessions.deleteViewerSocket(viewerWs);

		const hostWs = this.sessions.getHostSocket(agentId);
		if (hostWs) {
			this.sendTo(hostWs, { event: SIGNALING.VIEWER_LEFT, viewerId, agentId });
		}
	}

	getViewers(agentId: string): ViewerInfo[] {
		const byViewerId = new Map<string, ViewerInfo>();
		for (const { meta } of this.sessions.getViewerSocketsForAgent(agentId)) {
			const prev = byViewerId.get(meta.viewerId);
			if (!prev || prev.connected_at < meta.connectedAt) {
				byViewerId.set(meta.viewerId, {
					viewer_id: meta.viewerId,
					label: meta.label,
					connected_at: meta.connectedAt,
				});
			}
		}
		return [...byViewerId.values()];
	}

	notifyAgentSubscribers(agentId: string, event: AgentNotification): void {
		const message = JSON.stringify(event);
		for (const [ws, id] of this.sessions.getSubscriptions()) {
			if (id === agentId && ws.readyState === WebSocket.OPEN) {
				ws.send(message);
			}
		}
	}

	// ─── Private helpers ───────────────────────────────────────────────────────

	private closeEvictedSockets(sockets: WebSocket[]): void {
		for (const ws of sockets) {
			if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
				ws.close();
			}
		}
	}
}
