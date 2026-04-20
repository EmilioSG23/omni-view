import { AgentEntity } from "@/agents/agent.entity";
import { AddToBlacklistDto, AddToWhitelistDto, RegisterAgentDto } from "@/agents/agents.dto";
import { BlacklistEntity } from "@/agents/blacklist.entity";
import { WhitelistEntity } from "@/agents/whitelist.entity";
import logger from "@/common/custom-logger.service";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class AgentsService {
	constructor(
		@InjectRepository(AgentEntity)
		private readonly agents: Repository<AgentEntity>,
		@InjectRepository(WhitelistEntity)
		private readonly whitelist: Repository<WhitelistEntity>,
		@InjectRepository(BlacklistEntity)
		private readonly blacklist: Repository<BlacklistEntity>,
	) {}

	/** Register a new agent or update an existing one's metadata. */
	async register(dto: RegisterAgentDto): Promise<AgentEntity> {
		logger.info(`Registering agent ${dto.agent_id} (version ${dto.version})`, "AgentsService");
		const existing = await this.agents.findOne({ where: { agent_id: dto.agent_id } });

		if (existing) {
			existing.version = dto.version;
			if (dto.label !== undefined) existing.label = dto.label ?? null;
			if (dto.ws_url !== undefined) existing.ws_url = dto.ws_url ?? null;
			if (dto.password_hash !== undefined) existing.password_hash = dto.password_hash ?? null;
			if (dto.capture_mode !== undefined) existing.capture_mode = dto.capture_mode ?? null;
			return this.agents.save(existing);
		}

		const entity = this.agents.create({
			agent_id: dto.agent_id,
			label: dto.label ?? null,
			version: dto.version,
			ws_url: dto.ws_url ?? null,
			password_hash: dto.password_hash ?? null,
			capture_mode: dto.capture_mode ?? null,
		});
		logger.info(`Agent ${dto.agent_id} registered`, "AgentsService");
		return this.agents.save(entity);
	}

	/** Return the WebSocket URL and password hash for backend-pull mode. */
	async getConnectionInfo(agentId: string): Promise<{ ws_url: string; password_hash: string }> {
		const agent = await this.findOne(agentId);
		if (!agent.ws_url) {
			throw new NotFoundException(`Agent ${agentId} has no registered ws_url`);
		}
		if (!agent.password_hash) {
			throw new NotFoundException(`Agent ${agentId} has no registered password_hash`);
		}
		return { ws_url: agent.ws_url, password_hash: agent.password_hash };
	}

	/** Update the last_seen_at timestamp for an agent. */
	async heartbeat(agentId: string): Promise<void> {
		const agent = await this.agents.findOne({ where: { agent_id: agentId } });
		if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
		// UpdateDateColumn updates automatically on save
		await this.agents.save(agent);
		logger.info(`Heartbeat received from agent ${agentId}`, "AgentsService.heartbeat");
	}

	findAll(): Promise<AgentEntity[]> {
		return this.agents.find();
	}

	async findOne(agentId: string): Promise<AgentEntity> {
		const agent = await this.agents.findOne({ where: { agent_id: agentId } });
		if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
		return agent;
	}

	/** Add a device to an agent's whitelist. Returns existing entry if already present. */
	async addToWhitelist(agentId: string, dto: AddToWhitelistDto): Promise<WhitelistEntity> {
		await this.findOne(agentId);

		const existing = await this.whitelist.findOne({
			where: { agent_id: agentId, device_id: dto.device_id },
		});
		if (existing) return existing;

		const entry = this.whitelist.create({
			agent_id: agentId,
			device_id: dto.device_id,
			label: dto.label ?? null,
		});
		return this.whitelist.save(entry);
	}

	async removeFromWhitelist(agentId: string, deviceId: string): Promise<void> {
		const entry = await this.whitelist.findOne({
			where: { agent_id: agentId, device_id: deviceId },
		});
		if (!entry) {
			throw new NotFoundException(`Device ${deviceId} not in whitelist for agent ${agentId}`);
		}
		await this.whitelist.remove(entry);
	}

	getWhitelist(agentId: string): Promise<WhitelistEntity[]> {
		return this.whitelist.find({ where: { agent_id: agentId } });
	}

	async isWhitelisted(agentId: string, deviceId: string): Promise<boolean> {
		const entry = await this.whitelist.findOne({
			where: { agent_id: agentId, device_id: deviceId },
		});
		return entry !== null;
	}

	async addToBlacklist(agentId: string, dto: AddToBlacklistDto): Promise<BlacklistEntity> {
		await this.findOne(agentId);
		const existing = await this.blacklist.findOne({
			where: { agent_id: agentId, device_id: dto.device_id },
		});
		if (existing) return existing;
		const entry = this.blacklist.create({
			agent_id: agentId,
			device_id: dto.device_id,
			label: dto.label ?? null,
		});
		return this.blacklist.save(entry);
	}

	async removeFromBlacklist(agentId: string, deviceId: string): Promise<void> {
		const entry = await this.blacklist.findOne({
			where: { agent_id: agentId, device_id: deviceId },
		});
		if (!entry)
			throw new NotFoundException(`Device ${deviceId} not in blacklist for agent ${agentId}`);
		await this.blacklist.remove(entry);
	}

	getBlacklist(agentId: string): Promise<BlacklistEntity[]> {
		return this.blacklist.find({ where: { agent_id: agentId } });
	}

	async isBlacklisted(agentId: string, deviceId: string): Promise<boolean> {
		const entry = await this.blacklist.findOne({
			where: { agent_id: agentId, device_id: deviceId },
		});
		return entry !== null;
	}
}
