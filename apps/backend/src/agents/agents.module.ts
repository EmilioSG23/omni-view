import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AgentEntity } from "./agent.entity";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { WhitelistEntity } from "./whitelist.entity";

@Module({
	imports: [TypeOrmModule.forFeature([AgentEntity, WhitelistEntity])],
	controllers: [AgentsController],
	providers: [AgentsService],
	exports: [AgentsService],
})
export class AgentsModule {}
