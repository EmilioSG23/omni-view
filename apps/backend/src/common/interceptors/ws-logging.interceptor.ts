import { CustomLogger } from "@/common/custom-logger.service";
import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
} from "@nestjs/common";
import { type Observable, tap } from "rxjs";

/**
 * WebSocket interceptor that logs each handled event together with its
 * processing duration in milliseconds.
 */
@Injectable()
export class WsLoggingInterceptor implements NestInterceptor {
	private readonly logger = new CustomLogger();

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const event = context.switchToWs().getPattern() as string;
		const start = Date.now();

		return next.handle().pipe(
			tap(() => {
				this.logger.debug(`${event} +${Date.now() - start}ms`, "WsGateway");
			}),
		);
	}
}
