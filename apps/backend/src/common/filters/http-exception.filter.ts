import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
	catch(exception: HttpException, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<Response>();
		const status = exception.getStatus();
		const exceptionResponse = exception.getResponse();

		const message =
			typeof exceptionResponse === "string"
				? exceptionResponse
				: ((exceptionResponse as { message?: unknown }).message ?? exception.message);

		response.status(status).json({
			statusCode: status,
			error: HttpStatus[status] ?? "Error",
			message,
		});
	}
}
