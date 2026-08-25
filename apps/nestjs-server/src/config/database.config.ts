import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PoolConfig } from "pg";
import type { AppConfigService } from "#src/types/index.js";

export const DATABASE_CONFIG = Symbol("DATABASE_CONFIG");
export type DatabaseConfig = PoolConfig;

/** Builds the node-postgres pool configuration from validated settings. */
function createDatabaseConfig(config: AppConfigService): DatabaseConfig {
	const sslMode = config.get("PGSSLMODE", { infer: true });
	const ssl =
		sslMode === "disable"
			? false
			: sslMode === "no-verify"
				? { rejectUnauthorized: false }
				: sslMode
					? { rejectUnauthorized: true }
					: undefined;

	return {
		application_name: config.get("APP_NAME", { infer: true }),
		connectionTimeoutMillis: config.get("DB_CONNECT_TIMEOUT_MS", {
			infer: true,
		}),
		database: config.get("DB_NAME", { infer: true }),
		host: config.get("DB_HOST", { infer: true }),
		keepAlive: true,
		password: config.get("DB_PASSWORD", { infer: true }),
		port: config.get("DB_PORT", { infer: true }),
		ssl,
		user: config.get("DB_USERNAME", { infer: true }),
	};
}

export const databaseConfigProvider: FactoryProvider<DatabaseConfig> = {
	provide: DATABASE_CONFIG,
	inject: [ConfigService],
	useFactory: createDatabaseConfig,
};
