import { type FactoryProvider, Inject, Logger } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
	DATABASE_CONFIG,
	type DatabaseConfig,
} from "../config/database.config.js";
import * as schema from "./schema/index.js";

export const DATABASE = Symbol("DATABASE");
const databaseLogger = new Logger("DatabasePool");

export type AppDatabase = NodePgDatabase<typeof schema> & { $client: Pool };

export const databaseProvider: FactoryProvider<AppDatabase> = {
	provide: DATABASE,
	inject: [DATABASE_CONFIG],
	useFactory: (config: DatabaseConfig) => {
		const client = new Pool(config);
		client.on("error", (error) => {
			databaseLogger.error(
				"An idle PostgreSQL connection failed; readiness will report the outage",
				error.stack,
			);
		});
		return drizzle({ client, schema });
	},
};

export const InjectDatabase = () => Inject(DATABASE);
