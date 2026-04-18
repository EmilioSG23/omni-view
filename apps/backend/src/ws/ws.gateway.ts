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

@WebSocketGateway({ path: "/api/ws" })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Server;

	private readonly subscriptions = new Map<WebSocket, string>();

	handleConnection(client: WebSocket): void {
		console.log("[WS] Client connected to signaling gateway");
	}

	handleDisconnect(client: WebSocket): void {
		this.subscriptions.delete(client);
		console.log("[WS] Client disconnected from signaling gateway");
	}

	@SubscribeMessage("subscribe")
	handleSubscribe(@ConnectedSocket() client: WebSocket, @MessageBody() agentId: string): void {
		this.subscriptions.set(client, agentId);
		console.log(`[WS] Client subscribed to agent ${agentId}`);
	}

	@SubscribeMessage("unsubscribe")
	handleUnsubscribe(@ConnectedSocket() client: WebSocket): void {
		this.subscriptions.delete(client);
	}

	notifyAgentSubscribers(agentId: string, event: Record<string, unknown>): void {
		const message = JSON.stringify(event);
		for (const [ws, id] of this.subscriptions) {
			if (id === agentId && ws.readyState === ws.OPEN) {
				ws.send(message);
			}
		}
	}
}
