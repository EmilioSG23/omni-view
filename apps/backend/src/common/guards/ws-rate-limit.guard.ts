import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { WebSocket } from "ws";

/** Maximum number of WebSocket messages allowed per client within WINDOW_MS. */
const WINDOW_MS = 1_000;
const MAX_MESSAGES = 30;

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

/**
 * WebSocket guard that limits clients to {@link MAX_MESSAGES} messages per
 * {@link WINDOW_MS} millisecond window.  Throws a {@link WsException} when the
 * limit is exceeded, which NestJS translates to a `{ event: "exception" }` frame.
 */
@Injectable()
export class WsRateLimitGuard implements CanActivate {
	private readonly counters = new WeakMap<WebSocket, RateLimitEntry>();

	canActivate(context: ExecutionContext): boolean {
		const client = context.switchToWs().getClient<WebSocket>();
		const now = Date.now();
		const entry = this.counters.get(client);

		if (!entry || now >= entry.resetAt) {
			this.counters.set(client, { count: 1, resetAt: now + WINDOW_MS });
			return true;
		}

		entry.count += 1;

		if (entry.count > MAX_MESSAGES) {
			throw new WsException("Rate limit exceeded");
		}

		return true;
	}
}
