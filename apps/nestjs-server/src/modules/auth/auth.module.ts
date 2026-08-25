import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { type AppDatabase, DATABASE } from "#/db/database.provider.js";
import type { AppConfigService } from "#/types/index.js";
import { createApplicationAuth } from "./auth.factory.js";

/** Builds Better Auth using Nest-injected configuration and database services. */
function createAuthOptions(config: AppConfigService, database: AppDatabase) {
	return { auth: createApplicationAuth(config, database) };
}

@Module({
	imports: [
		ConfigModule,
		BetterAuthModule.forRootAsync({
			disableGlobalAuthGuard: true,
			inject: [ConfigService, DATABASE],
			useFactory: createAuthOptions,
		}),
	],
})
export class ApplicationAuthModule {}
