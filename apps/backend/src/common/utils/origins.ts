import { ConfigService } from "@nestjs/config";

export function obtainAllowedOrigins(configService: ConfigService): string[] {
	const allowedOriginsRaw = configService.get<string>("ALLOWED_ORIGINS") ?? "";
	return allowedOriginsRaw
		.split(";")
		.map((s) => s.trim())
		.filter(Boolean);
}
