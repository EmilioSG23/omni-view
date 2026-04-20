import { Module, forwardRef } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { WsGateway } from "./ws.gateway";

@Module({
	imports: [forwardRef(() => AgentsModule)],
	providers: [WsGateway],
	exports: [WsGateway],
})
export class WsModule {}
