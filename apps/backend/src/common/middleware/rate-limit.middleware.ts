import configuration from "@/config/configuration";
import { RequestHandler } from "express";
import rateLimit from "express-rate-limit";

export const apiRateLimiter: RequestHandler = rateLimit({
	windowMs: configuration().rateLimit.windowMs,
	max: configuration().rateLimit.max,
	standardHeaders: true,
	legacyHeaders: false,
	skip: (req) => {
		const upgrade = req.headers["upgrade"];
		if (upgrade && String(upgrade).toLowerCase() === "websocket") return true;
		if (req.path && req.path.startsWith("/health")) return true;
		return false;
	},
});
