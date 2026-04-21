import { AppModule } from "@/app.module";
import logger from "@/common/custom-logger.service";
import { HttpExceptionFilter } from "@/common/filters/http-exception.filter";
import { apiRateLimiter } from "@/common/middleware/rate-limit.middleware";
import { obtainAllowedOrigins } from "@/common/utils/origins";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { isEnv } from "./common/utils/env";

function allowOrigins(app: INestApplication, configService: ConfigService): void {
	const allowedOrigins = obtainAllowedOrigins(configService);

	if (allowedOrigins.length > 0) {
		app.enableCors({
			origin: (
				origin: string | undefined,
				callback: (err: Error | null, allow?: boolean) => void,
			) => {
				if (!origin) return callback(null, true);
				if (allowedOrigins.includes(origin)) return callback(null, true);
				return callback(new Error("CORS not allowed"), false);
			},
			credentials: true,
		});
	} else {
		app.enableCors();
	}
}

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule);

	app.useWebSocketAdapter(new WsAdapter(app));
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
		}),
	);
	app.useGlobalFilters(new HttpExceptionFilter());
	app.setGlobalPrefix("api");

	const configService = app.get(ConfigService);
	allowOrigins(app, configService);
	app.use("/api", apiRateLimiter);

	const port = process.env.PORT ?? 3000;
	app.useLogger(logger as any);

	await app.listen(port);
	if (!isEnv("production")) {
		logger.info(`OmniView Backend running on http://localhost:${port}/api`, "Bootstrap");
	} else {
		logger.info(`OmniView Backend running on port ${port}`, "Bootstrap");
	}
}

bootstrap();
