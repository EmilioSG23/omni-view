import { AgentsModule } from "@/agents/agents.module";
import { WsGateway } from "@/ws/ws.gateway";
import { Module, forwardRef } from "@nestjs/common";

@Module({
	imports: [forwardRef(() => AgentsModule)],
	providers: [WsGateway],
	exports: [WsGateway],
})
export class WsModule {}
