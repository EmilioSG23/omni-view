import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Patch,
	Post,
	Query,
} from "@nestjs/common";
import { hashPassword } from "../common/utils/crypto";
import { WsGateway } from "../ws/ws.gateway";
import { AgentClientService } from "./agent-client.service";
import {
	AddToWhitelistDto,
	CheckWhitelistQueryDto,
	ConnectAgentDto,
	RegisterAgentDto,
} from "./agents.dto";
import { toAgentSummary } from "./agents.mapper";
import { AgentSummaryDto, RegisterAgentResponseDto } from "./agents.responses";
import { AgentsService } from "./agents.service";

@Controller("agents")
export class AgentsController {
	constructor(
		private readonly agentsService: AgentsService,
		private readonly agentClientService: AgentClientService,
		private readonly wsGateway: WsGateway,
	) {}

	/** Register or update an agent. Called by the agent on startup. */
	@Post("register")
	async register(@Body() dto: RegisterAgentDto): Promise<RegisterAgentResponseDto> {
		const entity = await this.agentsService.register(dto);
		return {
			agent_id: entity.agent_id,
			registered_at: entity.registered_at.toISOString(),
		};
	}

	/** List all registered agents. */
	@Get()
	async findAll(): Promise<AgentSummaryDto[]> {
		const entities = await this.agentsService.findAll();
		return entities.map(toAgentSummary);
	}

	/** Get a specific agent by ID. */
	@Get(":id")
	async findOne(@Param("id") id: string): Promise<AgentSummaryDto> {
		const entity = await this.agentsService.findOne(id);
		return toAgentSummary(entity);
	}

	/** Mark an agent as recently active. Called by the agent on each heartbeat. */
	@Patch(":id/heartbeat")
	@HttpCode(HttpStatus.NO_CONTENT)
	async heartbeat(@Param("id") id: string): Promise<void> {
		await this.agentsService.heartbeat(id);
	}

	/** Add a device to an agent's whitelist. */
	@Post(":id/whitelist")
	addToWhitelist(@Param("id") agentId: string, @Body() dto: AddToWhitelistDto) {
		return this.agentsService.addToWhitelist(agentId, dto);
	}

	/** Remove a device from an agent's whitelist. */
	@Delete(":id/whitelist/:deviceId")
	@HttpCode(HttpStatus.NO_CONTENT)
	async removeFromWhitelist(
		@Param("id") agentId: string,
		@Param("deviceId") deviceId: string,
	): Promise<void> {
		await this.agentsService.removeFromWhitelist(agentId, deviceId);
	}

	/** List all whitelisted devices for an agent. */
	@Get(":id/whitelist")
	getWhitelist(@Param("id") agentId: string) {
		return this.agentsService.getWhitelist(agentId);
	}

	/**
	 * Check whether a specific device is whitelisted for an agent.
	 * GET /api/agents/:id/whitelist/check?device_id=<id>
	 */
	@Get(":id/whitelist/check")
	async checkWhitelist(@Param("id") agentId: string, @Query() query: CheckWhitelistQueryDto) {
		const allowed = await this.agentsService.isWhitelisted(agentId, query.device_id);
		return { allowed };
	}

	// ---------------------------------------------------------------------------
	// Backend-pull session control
	// ---------------------------------------------------------------------------

	/**
	 * Instruct the backend to open a WebSocket connection to this agent.
	 * POST /api/agents/:id/connect
	 * Body: { password?, ws_url? }
	 */
	@Post(":id/connect")
	@HttpCode(HttpStatus.NO_CONTENT)
	async connect(@Param("id") agentId: string, @Body() dto: ConnectAgentDto): Promise<void> {
		const { ws_url, password_hash } = await this.agentsService.getConnectionInfo(agentId);
		const resolvedUrl = dto.ws_url ?? ws_url;
		const resolvedHash = dto.password ? hashPassword(dto.password) : password_hash;
		// persist flag: only persist frames for this session if explicitly requested
		const persist = !!dto.persist;
		this.agentClientService.connect(agentId, resolvedUrl, resolvedHash, persist);
	}

	/**
	 * Instruct the backend to close its connection to this agent.
	 * DELETE /api/agents/:id/connect
	 */
	@Delete(":id/connect")
	@HttpCode(HttpStatus.NO_CONTENT)
	disconnect(@Param("id") agentId: string): void {
		this.agentClientService.disconnect(agentId);
	}

	/**
	 * Return whether the backend currently has an open connection to this agent.
	 * GET /api/agents/:id/status
	 */
	@Get(":id/status")
	status(@Param("id") agentId: string) {
		return {
			agentId,
			connected: this.agentClientService.isConnected(agentId),
		};
	}

	/** List viewers currently watching a browser-captured agent via WebRTC. */
	@Get(":id/viewers")
	getViewers(
		@Param("id") agentId: string,
	): Array<{ viewer_id: string; label?: string; connected_at: string }> {
		return this.wsGateway.getViewers(agentId);
	}

	/** Kick a viewer from a browser-captured agent session. */
	@Delete(":id/viewers/:viewerId")
	@HttpCode(HttpStatus.NO_CONTENT)
	kickViewer(@Param("id") agentId: string, @Param("viewerId") viewerId: string): void {
		this.wsGateway.kickViewer(agentId, viewerId);
	}
}
