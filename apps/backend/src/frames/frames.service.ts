import { FrameEntity } from "@/frames/frame.entity";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class FramesService {
	constructor(
		@InjectRepository(FrameEntity)
		private readonly frames: Repository<FrameEntity>,
	) {}

	save(data: Omit<FrameEntity, "id" | "created_at">): Promise<FrameEntity> {
		return this.frames.save(this.frames.create(data));
	}

	findByAgent(agentId: string, limit = 100): Promise<FrameEntity[]> {
		return this.frames.find({
			where: { agent_id: agentId },
			order: { created_at: "DESC" },
			take: limit,
		});
	}

	async deleteOlderThan(agentId: string, before: Date): Promise<number> {
		const result = await this.frames
			.createQueryBuilder()
			.delete()
			.where("agent_id = :agentId AND created_at < :before", { agentId, before })
			.execute();
		return result.affected ?? 0;
	}
}
