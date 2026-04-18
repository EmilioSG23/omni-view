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
import { AddToWhitelistDto, CheckWhitelistQueryDto, RegisterAgentDto } from "./agents.dto";
import { AgentsService } from "./agents.service";

@Controller("agents")
export class AgentsController {
	constructor(private readonly agentsService: AgentsService) {}

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
}
