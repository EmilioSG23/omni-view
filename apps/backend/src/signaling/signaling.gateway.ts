import { AccessDenyDto } from "@/signaling/dto/access-deny.dto";
import { AccessGrantDto } from "@/signaling/dto/access-grant.dto";
import { AccessRequestDto } from "@/signaling/dto/access-request.dto";
import { HostJoinDto } from "@/signaling/dto/host-join.dto";
import { ViewerConfigDto } from "@/signaling/dto/viewer-config.dto";
import { ViewerRequestDto } from "@/signaling/dto/viewer-request.dto";
import { WebRtcAnswerDto, WebRtcIceDto, WebRtcOfferDto } from "@/signaling/dto/webrtc.dto";
import { SignalingService } from "@/signaling/signaling.service";
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from "@nestjs/websockets";
import { SIGNALING } from "@omni-view/shared";
import { Server, WebSocket } from "ws";

@WebSocketGateway({ path: "/api/ws" })
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
	constructor(private readonly signalingService: SignalingService) {}

	@WebSocketServer()
	server!: Server;

	handleConnection(client: WebSocket): void {
		this.signalingService.handleConnect(client);
	}

	handleDisconnect(client: WebSocket): void {
		this.signalingService.handleDisconnect(client);
	}

	// ─── Rust-agent subscriptions ──────────────────────────────────────────────

	@SubscribeMessage("subscribe")
	handleSubscribe(@ConnectedSocket() client: WebSocket, @MessageBody() agentId: string): void {
		this.signalingService.handleSubscribe(client, agentId);
	}

	@SubscribeMessage("unsubscribe")
	handleUnsubscribe(@ConnectedSocket() client: WebSocket): void {
		this.signalingService.handleUnsubscribe(client);
	}

	// ─── WebRTC signaling ──────────────────────────────────────────────────────

	@SubscribeMessage(SIGNALING.HOST_JOIN)
	handleHostJoin(@ConnectedSocket() client: WebSocket, @MessageBody() payload: HostJoinDto): void {
		this.signalingService.handleHostJoin(client, payload);
	}

	@SubscribeMessage(SIGNALING.VIEWER_REQUEST)
	async handleViewerRequest(
		@ConnectedSocket() client: WebSocket,
		@MessageBody() payload: ViewerRequestDto,
	): Promise<void> {
		await this.signalingService.handleViewerRequest(client, payload);
	}

	@SubscribeMessage(SIGNALING.ACCESS_REQUEST)
	async handleAccessRequest(
		@ConnectedSocket() client: WebSocket,
		@MessageBody() payload: AccessRequestDto,
	): Promise<void> {
		await this.signalingService.handleAccessRequest(client, payload);
	}

	@SubscribeMessage(SIGNALING.ACCESS_GRANT)
	async handleAccessGrant(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody() payload: AccessGrantDto,
	): Promise<void> {
		await this.signalingService.handleAccessGrant(payload);
	}

	@SubscribeMessage(SIGNALING.ACCESS_DENY)
	async handleAccessDeny(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody() payload: AccessDenyDto,
	): Promise<void> {
		await this.signalingService.handleAccessDeny(payload);
	}

	@SubscribeMessage(SIGNALING.WEBRTC_OFFER)
	handleOffer(@ConnectedSocket() _client: WebSocket, @MessageBody() payload: WebRtcOfferDto): void {
		this.signalingService.handleOffer(payload);
	}

	@SubscribeMessage(SIGNALING.WEBRTC_ANSWER)
	handleAnswer(
		@ConnectedSocket() _client: WebSocket,
		@MessageBody() payload: WebRtcAnswerDto,
	): void {
		this.signalingService.handleAnswer(payload);
	}

	@SubscribeMessage(SIGNALING.WEBRTC_ICE)
	handleIce(@ConnectedSocket() client: WebSocket, @MessageBody() payload: WebRtcIceDto): void {
		this.signalingService.handleIce(client, payload);
	}

	@SubscribeMessage(SIGNALING.VIEWER_CONFIG)
	handleViewerConfig(
		@ConnectedSocket() client: WebSocket,
		@MessageBody() payload: ViewerConfigDto,
	): void {
		this.signalingService.handleViewerConfig(client, payload);
	}
}
