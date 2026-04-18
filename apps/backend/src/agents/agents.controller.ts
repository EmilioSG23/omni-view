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
import { AgentClientService } from "./agent-client.service";
import {
	AddToWhitelistDto,
	CheckWhitelistQueryDto,
	ConnectAgentDto,
	RegisterAgentDto,
} from "./agents.dto";
import { AgentsService } from "./agents.service";

@Controller("agents")
export class AgentsController {
	constructor(
		private readonly agentsService: AgentsService,
		private readonly agentClientService: AgentClientService,
	) {}

	/** Register or update an agent. Called by the agent on startup. */
	@Post("register")
	register(@Body() dto: RegisterAgentDto) {
		return this.agentsService.register(dto);
	}

	/** List all registered agents. */
	@Get()
	findAll() {
		return this.agentsService.findAll();
	}

	/** Get a specific agent by ID. */
	@Get(":id")
	findOne(@Param("id") id: string) {
		return this.agentsService.findOne(id);
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
}
