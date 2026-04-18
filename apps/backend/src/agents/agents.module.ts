import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FramesModule } from "../frames/frames.module";
import { WsModule } from "../ws/ws.module";
import { AgentClientService } from "./agent-client.service";
import { AgentEntity } from "./agent.entity";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { WhitelistEntity } from "./whitelist.entity";

@Module({
	imports: [TypeOrmModule.forFeature([AgentEntity, WhitelistEntity]), FramesModule, WsModule],
	controllers: [AgentsController],
	providers: [AgentsService, AgentClientService],
	exports: [AgentsService, AgentClientService],
})
export class AgentsModule {}
