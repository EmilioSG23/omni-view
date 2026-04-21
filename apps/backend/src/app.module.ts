import { AgentsModule } from "@/agents/agents.module";
import { AppController } from "@/app.controller";
import { AppService } from "@/app.service";
import { OriginWhitelistMiddleware } from "@/common/middleware/origin-whitelist.middleware";
import configuration from "@/config/configuration";
import { databaseConfig } from "@/config/database.config";
import { FramesModule } from "@/frames/frames.module";
import { InfraModule } from "@/infra/infra.module";
import { WsModule } from "@/ws/ws.module";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
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
		TypeOrmModule.forRootAsync(databaseConfig),
		AgentsModule,
		FramesModule,
		WsModule,
		InfraModule,
	],
	controllers: [AppController],
	providers: [AppService, OriginWhitelistMiddleware],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(OriginWhitelistMiddleware).forRoutes("*");
	}
}
