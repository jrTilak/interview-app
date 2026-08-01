import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";

@Injectable()
export class ShutdownLoggerService implements OnApplicationShutdown {
	private readonly _logger = new Logger(ShutdownLoggerService.name);

	/** Records graceful shutdown without logging request or candidate data. */
	onApplicationShutdown(signal?: string): void {
		this._logger.log(
			`Application shutdown completed${signal ? ` (${signal})` : ""}`,
		);
	}
}
