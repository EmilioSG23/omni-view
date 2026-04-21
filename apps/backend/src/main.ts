import { AppModule } from "@/app.module";
import logger from "@/common/custom-logger.service";
import { HttpExceptionFilter } from "@/common/filters/http-exception.filter";
import { apiRateLimiter } from "@/common/middleware/rate-limit.middleware";
import { isEnv } from "@/common/utils/env";
import { obtainAllowedOrigins } from "@/common/utils/origins";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";

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

function parseTrustProxy(configService: ConfigService): boolean | number | string | undefined {
	const raw = configService.get<string>("TRUST_PROXY");
	if (typeof raw === "undefined") return undefined;
	if (raw === "true") return 1;
	if (raw === "false") return false;
	const n = Number(raw);
	if (!Number.isNaN(n)) return n;
	return raw;
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

	// Configure Express 'trust proxy' when running behind a reverse proxy (e.g. Render, Vercel)
	// express-rate-limit validates X-Forwarded-For; enable trust proxy to avoid ValidationError.
	try {
		const httpInstance = app.getHttpAdapter().getInstance() as any;
		const parsedTrustProxy = parseTrustProxy(configService);
		if (typeof parsedTrustProxy !== "undefined") {
			httpInstance.set("trust proxy", parsedTrustProxy);
		} else if (isEnv("production")) {
			httpInstance.set("trust proxy", 1);
		}
	} catch (err) {}

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
