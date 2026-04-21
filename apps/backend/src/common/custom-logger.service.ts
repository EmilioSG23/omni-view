import { isEnv } from "@/common/utils/env";
import { LoggerService } from "@nestjs/common";

const colors = {
	reset: "\u001b[0m",
	gray: "\u001b[90m",
	red: "\u001b[31m",
	yellow: "\u001b[33m",
	green: "\u001b[32m",
	blue: "\u001b[34m",
	magenta: "\u001b[35m",
};

function timestamp(): string {
	return new Date().toISOString();
}

function format(level: string, message: any, context?: string) {
	const color =
		level === "ERROR"
			? colors.red
			: level === "WARN"
				? colors.yellow
				: level === "DEBUG"
					? colors.blue
					: level === "VERBOSE"
						? colors.magenta
						: colors.green;

	const ctx = context ? ` ${colors.gray}[${context}]${colors.reset}` : "";
	const msg = typeof message === "string" ? message : JSON.stringify(message, null, 2);
	return `${colors.gray}${timestamp()}${colors.reset} ${color}${level}${colors.reset}:${ctx} ${msg}`;
}

export class CustomLogger implements LoggerService {
	private isDevelopment(): boolean {
		return isEnv("development");
	}

	log(message: any, context?: string) {
		console.log(format("INFO", message, context));
	}

	info(message: any, context?: string) {
		this.log(message, context);
	}

	error(message: any, trace?: string, context?: string) {
		const full = trace ? `${message}\n${trace}` : message;
		console.error(format("ERROR", full, context));
	}

	warn(message: any, context?: string) {
		console.warn(format("WARN", message, context));
	}

	debug(message: any, context?: string) {
		if (this.isDevelopment()) {
			console.debug(format("DEBUG", message, context));
		}
	}

	verbose(message: any, context?: string) {
		console.log(format("VERBOSE", message, context));
	}
}
// Aliases that many loggers expose
export interface SimpleLogger {
	info(message: any, context?: string): void;
	error(message: any, trace?: string, context?: string): void;
	warn(message: any, context?: string): void;
	debug(message: any, context?: string): void;
	verbose(message: any, context?: string): void;
}

// Export a single shared logger instance for convenience
export const logger = new CustomLogger();
export default logger;
