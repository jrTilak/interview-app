import { fileURLToPath } from "node:url";
import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { AppConfigService } from "#/types/index.js";
import type { AppDatabase } from "./database.provider.js";

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
	private readonly _logger = new Logger(DatabaseLifecycleService.name);

	constructor(
		private readonly _database: AppDatabase,
		private readonly _config: AppConfigService,
	) {}

	/** Verifies database connectivity before accepting application traffic. */
	async startup(): Promise<void> {
		await this._database.$client.query("select 1");
		this._logger.log("PostgreSQL connection established");
		if (this._config.get("DB_AUTO_MIGRATE", { infer: true })) {
			await migrate(this._database, {
				migrationsFolder: fileURLToPath(
					new URL("./migrations", import.meta.url),
				),
			});
			this._logger.log("Database migrations applied");
		}
	}

	/** Drains the PostgreSQL pool during graceful application shutdown. */
	async onApplicationShutdown(): Promise<void> {
		await this._database.$client.end();
		this._logger.log("PostgreSQL connection closed");
	}
}
