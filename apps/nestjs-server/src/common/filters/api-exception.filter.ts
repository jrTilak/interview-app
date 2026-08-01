import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	HttpException,
	HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";

type ErrorDetails = { error?: unknown; message?: string | string[] };

/** Normalizes all HTTP failures without leaking internal 5xx details. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
	/** Converts a thrown value into the stable public error envelope. */
	catch(exception: unknown, host: ArgumentsHost): void {
		const response = host.switchToHttp().getResponse<Response>();
		const status =
			exception instanceof HttpException
				? exception.getStatus()
				: HttpStatus.INTERNAL_SERVER_ERROR;
		const exceptionResponse =
			exception instanceof HttpException ? exception.getResponse() : null;
		const details =
			typeof exceptionResponse === "object" && exceptionResponse !== null
				? (exceptionResponse as ErrorDetails)
				: undefined;
		const safeMessage =
			status >= 500
				? "Whoops! Something went wrong on the server"
				: typeof exceptionResponse === "string"
					? exceptionResponse
					: Array.isArray(details?.message)
						? details.message.join(", ")
						: (details?.message ?? "Request failed");

		response.status(status).json({
			message: safeMessage,
			error: status >= 500 ? null : (details?.error ?? null),
		});
	}
}
