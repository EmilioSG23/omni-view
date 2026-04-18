import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from "@nestjs/websockets";
import { Server, WebSocket } from "ws";

/**
 * Signaling gateway — provides a WebSocket endpoint for clients to receive
 * real-time notifications about agent events (whitelist changes, status, etc.).
 *
 * Phase 1+2: basic event broadcasting infrastructure.
 * Future: WebRTC offer/answer exchange.
 */
@WebSocketGateway({ path: "/api/ws" })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Server;

	/** Map of WebSocket connection → subscribed agent ID */
	private readonly subscriptions = new Map<WebSocket, string>();

	handleConnection(client: WebSocket): void {
		console.log("[WS] Client connected to signaling gateway");
	}

	handleDisconnect(client: WebSocket): void {
		this.subscriptions.delete(client);
		console.log("[WS] Client disconnected from signaling gateway");
	}

	/**
	 * Subscribe to events for a specific agent.
	 * Payload: the agent's UUID string.
	 */
	@SubscribeMessage("subscribe")
	handleSubscribe(@ConnectedSocket() client: WebSocket, @MessageBody() agentId: string): void {
		this.subscriptions.set(client, agentId);
		console.log(`[WS] Client subscribed to agent ${agentId}`);
	}

	/** Unsubscribe from all agent events. */
	@SubscribeMessage("unsubscribe")
	handleUnsubscribe(@ConnectedSocket() client: WebSocket): void {
		this.subscriptions.delete(client);
	}

	/**
	 * Broadcast an event payload to all clients subscribed to a given agent.
	 * Called internally by services (e.g. after whitelist changes).
	 */
	notifyAgentSubscribers(agentId: string, event: Record<string, unknown>): void {
		const message = JSON.stringify(event);
		for (const [ws, id] of this.subscriptions) {
			if (id === agentId && ws.readyState === ws.OPEN) {
				ws.send(message);
			}
		}
	}
}
