import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AgentEntity } from "./agents/agent.entity";
import { AgentsModule } from "./agents/agents.module";
import { WhitelistEntity } from "./agents/whitelist.entity";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import configuration from "./config/configuration";
import { WsModule } from "./ws/ws.module";

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
		TypeOrmModule.forRoot({
			type: "better-sqlite3",
			database: process.env.DB_PATH ?? "omniview.db",
			entities: [AgentEntity, WhitelistEntity],
			// synchronize is safe for development/MVP. Disable in production.
			synchronize: true,
		}),
		AgentsModule,
		WsModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
