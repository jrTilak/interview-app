import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { databaseConfigProvider } from "#/config/database.config.js";
import type { AppConfigService } from "#/types/index.js";
import {
	type AppDatabase,
	DATABASE,
	databaseProvider,
} from "./database.provider.js";
import { DatabaseLifecycleService } from "./database-lifecycle.service.js";

@Global()
@Module({
	providers: [
		databaseConfigProvider,
		databaseProvider,
		{
			provide: DatabaseLifecycleService,
			inject: [DATABASE, ConfigService],
			useFactory: (database: AppDatabase, config: AppConfigService) =>
				new DatabaseLifecycleService(database, config),
		},
	],
	exports: [DATABASE, DatabaseLifecycleService],
})
export class DatabaseModule {}
