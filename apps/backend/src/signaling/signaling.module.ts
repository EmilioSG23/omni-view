import { AgentsModule } from "@/agents/agents.module";
import { SessionManager } from "@/signaling/session.manager";
import { SignalingGateway } from "@/signaling/signaling.gateway";
import { SignalingService } from "@/signaling/signaling.service";
import { Module, forwardRef } from "@nestjs/common";

@Module({
	imports: [forwardRef(() => AgentsModule)],
	providers: [SessionManager, SignalingService, SignalingGateway],
	exports: [SignalingService],
})
export class SignalingModule {}
