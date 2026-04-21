import { obtainAllowedOrigins } from "@/common/utils/origins";
import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class OriginWhitelistMiddleware implements NestMiddleware {
	private readonly logger = new Logger(OriginWhitelistMiddleware.name);
	private readonly allowedList: string[];

	constructor(private readonly configService: ConfigService) {
		const allowedOrigins = obtainAllowedOrigins(this.configService);
		this.allowedList = allowedOrigins.map((u) => u.replace(/\/$/, "").toLowerCase());
	}

	use(req: Request, res: Response, next: NextFunction) {
		if (!this.allowedList || this.allowedList.length === 0) {
			return next();
		}

		const originHeader = (req.headers.origin as string) || (req.headers.referer as string) || "";
		if (!originHeader) {
			return next();
		}

		const originNormalized = originHeader.replace(/\/$/, "").toLowerCase();

		if (this.allowedList.includes(originNormalized)) {
			return next();
		}

		this.logger.warn(`Blocked request from origin ${originHeader}`, "OriginWhitelistMiddleware");
		res.status(403).json({ statusCode: 403, message: "Origin not allowed" });
	}
}
