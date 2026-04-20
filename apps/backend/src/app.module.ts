import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AgentEntity } from "./agents/agent.entity";
import { AgentsModule } from "./agents/agents.module";
import { BlacklistEntity } from "./agents/blacklist.entity";
import { WhitelistEntity } from "./agents/whitelist.entity";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import configuration from "./config/configuration";
import { FrameEntity } from "./frames/frame.entity";
import { FramesModule } from "./frames/frames.module";
import { WsModule } from "./ws/ws.module";

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
		TypeOrmModule.forRoot({
			type: "better-sqlite3",
			database: process.env.DB_PATH ?? "omniview.db",
			entities: [AgentEntity, WhitelistEntity, BlacklistEntity, FrameEntity],
			// synchronize is safe for development/MVP. Disable in production.
			synchronize: true,
		}),
		AgentsModule,
		FramesModule,
		WsModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
