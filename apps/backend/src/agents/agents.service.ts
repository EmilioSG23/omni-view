import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AgentEntity } from "./agent.entity";
import { AddToWhitelistDto, RegisterAgentDto } from "./agents.dto";
import { WhitelistEntity } from "./whitelist.entity";

@Injectable()
export class AgentsService {
	constructor(
		@InjectRepository(AgentEntity)
		private readonly agents: Repository<AgentEntity>,
		@InjectRepository(WhitelistEntity)
		private readonly whitelist: Repository<WhitelistEntity>,
	) {}

	/** Register a new agent or update an existing one's metadata. */
	async register(dto: RegisterAgentDto): Promise<AgentEntity> {
		const existing = await this.agents.findOne({
			where: { agent_id: dto.agent_id },
		});

		if (existing) {
			existing.version = dto.version;
			if (dto.label !== undefined) {
				existing.label = dto.label ?? null;
			}
			return this.agents.save(existing);
		}

		const entity = this.agents.create({
			agent_id: dto.agent_id,
			label: dto.label ?? null,
			version: dto.version,
		});
		return this.agents.save(entity);
	}

	/** Update the last_seen_at timestamp for an agent. */
	async heartbeat(agentId: string): Promise<void> {
		const agent = await this.agents.findOne({ where: { agent_id: agentId } });
		if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
		// UpdateDateColumn updates automatically on save
		await this.agents.save(agent);
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
}
