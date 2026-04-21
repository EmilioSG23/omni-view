import { AgentsModule } from "@/agents/agents.module";
import { WsRateLimitGuard } from "@/common/guards/ws-rate-limit.guard";
import { WsLoggingInterceptor } from "@/common/interceptors/ws-logging.interceptor";
import { SessionManager } from "@/signaling/session.manager";
import { SignalingGateway } from "@/signaling/signaling.gateway";
import { SignalingService } from "@/signaling/signaling.service";
import { Module, forwardRef } from "@nestjs/common";

@Module({
	imports: [forwardRef(() => AgentsModule)],
	providers: [SessionManager, SignalingService, SignalingGateway, WsRateLimitGuard, WsLoggingInterceptor],
	exports: [SignalingService],
})
export class SignalingModule {}
