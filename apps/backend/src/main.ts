import { AppModule } from "@/app.module";
import logger from "@/common/custom-logger.service";
import { HttpExceptionFilter } from "@/common/filters/http-exception.filter";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";

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
	app.enableCors();
	app.setGlobalPrefix("api");

	const port = process.env.PORT ?? 3000;
	app.useLogger(logger as any);
	await app.listen(port);
	logger.info(`OmniView Backend running on http://localhost:${port}/api`, "Bootstrap");
}

bootstrap();
