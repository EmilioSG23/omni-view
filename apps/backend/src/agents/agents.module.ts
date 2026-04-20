import { AgentClientService } from "@/agents/agent-client.service";
import { AgentEntity } from "@/agents/agent.entity";
import { AgentsController } from "@/agents/agents.controller";
import { AgentsService } from "@/agents/agents.service";
import { BlacklistEntity } from "@/agents/blacklist.entity";
import { WhitelistEntity } from "@/agents/whitelist.entity";
import { FramesModule } from "@/frames/frames.module";
import { WsModule } from "@/ws/ws.module";
import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

@Module({
	imports: [
		TypeOrmModule.forFeature([AgentEntity, WhitelistEntity, BlacklistEntity]),
		FramesModule,
		forwardRef(() => WsModule),
	],
	controllers: [AgentsController],
	providers: [AgentsService, AgentClientService],
	exports: [AgentsService, AgentClientService],
})
export class AgentsModule {}
