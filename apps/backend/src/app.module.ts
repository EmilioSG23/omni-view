import { AgentEntity } from "@/agents/agent.entity";
import { AgentsModule } from "@/agents/agents.module";
import { BlacklistEntity } from "@/agents/blacklist.entity";
import { WhitelistEntity } from "@/agents/whitelist.entity";
import { AppController } from "@/app.controller";
import { AppService } from "@/app.service";
import configuration from "@/config/configuration";
import { FrameEntity } from "@/frames/frame.entity";
import { FramesModule } from "@/frames/frames.module";
import { WsModule } from "@/ws/ws.module";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import path from "node:path";

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [configuration],
			envFilePath: [
				path.resolve(process.cwd(), ".env.local"),
				path.resolve(process.cwd(), ".env"),
				path.resolve(__dirname, "../.env.local"),
				path.resolve(__dirname, "../.env"),
				path.resolve(__dirname, "../../.env.local"),
				path.resolve(__dirname, "../../.env"),
			],
		}),
		TypeOrmModule.forRoot({
			type: "better-sqlite3",
			database: process.env.DB_PATH ?? "omniview.db",
			entities: [AgentEntity, WhitelistEntity, BlacklistEntity, FrameEntity],
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
