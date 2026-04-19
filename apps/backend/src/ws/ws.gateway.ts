import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from "@nestjs/websockets";
import { createHash } from "crypto";
import { Server, WebSocket } from "ws";

interface ViewerMeta {
	agentId: string;
	viewerId: string;
	label?: string;
	connectedAt: string;
}

interface ViewerInfo {
	viewer_id: string;
	label?: string;
	connected_at: string;
}

@WebSocketGateway({ path: "/api/ws" })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
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

		// Clean up if disconnected client was a host.
		for (const [agentId, hostWs] of this.hostSockets) {
			if (hostWs === client) {
				this.hostSockets.delete(agentId);
				this.hostPasswords.delete(agentId);
				for (const [viewerWs, meta] of this.viewerSockets) {
					if (meta.agentId === agentId) {
						this.sendTo(viewerWs, { event: "host:disconnected", agentId });
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
					event: "viewer:left",
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
	@SubscribeMessage("host:join")
	handleHostJoin(
		@ConnectedSocket() client: WebSocket,
		@MessageBody() payload: { agentId: string; passwordHash: string },
	): void {
		this.hostSockets.set(payload.agentId, client);
		this.hostPasswords.set(payload.agentId, payload.passwordHash);
	}

	/** Viewer requests to watch a browser-captured agent. */
	@SubscribeMessage("viewer:request")
	handleViewerRequest(
		@ConnectedSocket() client: WebSocket,
		@MessageBody() payload: { agentId: string; viewerId: string; password: string; label?: string },
	): void {
		const storedHash = this.hostPasswords.get(payload.agentId);
		if (storedHash) {
			const attemptHash = createHash("sha256").update(payload.password).digest("hex");
			if (attemptHash !== storedHash) {
				this.sendTo(client, { event: "viewer:rejected", reason: "invalid_password" });
				return;
			}
		}

		const hostWs = this.hostSockets.get(payload.agentId);
		if (!hostWs) {
			this.sendTo(client, { event: "viewer:rejected", reason: "host_not_available" });
			return;
		}

		this.viewerSockets.set(client, {
			agentId: payload.agentId,
			viewerId: payload.viewerId,
			label: payload.label,
			connectedAt: new Date().toISOString(),
		});

		this.sendTo(hostWs, {
			event: "viewer:joined",
			viewerId: payload.viewerId,
			label: payload.label,
			agentId: payload.agentId,
		});
	}

	/** Host sends SDP offer to a specific viewer. */
	@SubscribeMessage("webrtc:offer")
	handleOffer(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody() payload: { agentId: string; viewerId: string; sdp: unknown },
	): void {
		for (const [viewerWs, meta] of this.viewerSockets) {
			if (meta.agentId === payload.agentId && meta.viewerId === payload.viewerId) {
				this.sendTo(viewerWs, {
					event: "webrtc:offer",
					agentId: payload.agentId,
					sdp: payload.sdp,
				});
				return;
			}
		}
	}

	/** Viewer sends SDP answer back to host. */
	@SubscribeMessage("webrtc:answer")
	handleAnswer(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody() payload: { agentId: string; viewerId: string; sdp: unknown },
	): void {
		const hostWs = this.hostSockets.get(payload.agentId);
		if (hostWs) {
			this.sendTo(hostWs, {
				event: "webrtc:answer",
				viewerId: payload.viewerId,
				agentId: payload.agentId,
				sdp: payload.sdp,
			});
		}
	}

	/** Either side relays an ICE candidate to the other peer. */
	@SubscribeMessage("webrtc:ice")
	handleIce(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody()
		payload: { agentId: string; viewerId: string; candidate: unknown; fromHost: boolean },
	): void {
		if (payload.fromHost) {
			for (const [viewerWs, meta] of this.viewerSockets) {
				if (meta.agentId === payload.agentId && meta.viewerId === payload.viewerId) {
					this.sendTo(viewerWs, {
						event: "webrtc:ice",
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
					event: "webrtc:ice",
					viewerId: payload.viewerId,
					agentId: payload.agentId,
					candidate: payload.candidate,
				});
			}
		}
	}

	// ─── Public helpers ────────────────────────────────────────────────────────

	/** Kick a viewer by closing their connection. */
	kickViewer(agentId: string, viewerId: string): void {
		for (const [viewerWs, meta] of this.viewerSockets) {
			if (meta.agentId === agentId && meta.viewerId === viewerId) {
				this.sendTo(viewerWs, { event: "viewer:kicked" });
				viewerWs.close();
				this.viewerSockets.delete(viewerWs);
				const hostWs = this.hostSockets.get(agentId);
				if (hostWs) {
					this.sendTo(hostWs, { event: "viewer:left", viewerId, agentId });
				}
				return;
			}
		}
	}

	/** Return currently connected viewers for an agent. */
	getViewers(agentId: string): ViewerInfo[] {
		const result: ViewerInfo[] = [];
		for (const meta of this.viewerSockets.values()) {
			if (meta.agentId === agentId) {
				result.push({
					viewer_id: meta.viewerId,
					label: meta.label,
					connected_at: meta.connectedAt,
				});
			}
		}
		return result;
	}

	/** Notify all Rust-agent subscribers of a state change. */
	notifyAgentSubscribers(agentId: string, event: Record<string, unknown>): void {
		const message = JSON.stringify(event);
		for (const [ws, id] of this.subscriptions) {
			if (id === agentId && ws.readyState === WebSocket.OPEN) {
				ws.send(message);
			}
		}
	}
}
