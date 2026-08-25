import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { openAPI } from "better-auth/plugins";
import type { AppDatabase } from "#/db/database.provider.js";
import * as schema from "#/db/schema/index.js";
import type { AppConfigService } from "#/types/index.js";

export const ALLOWED_AUTH_PATHS = [
	"/sign-up/email",
	"/sign-in/email",
	"/sign-out",
	"/get-session",
] as const;

/** Creates the deliberately narrow email/password Better Auth instance. */
export function createApplicationAuth(
	config: AppConfigService,
	database: AppDatabase,
) {
	const basePath = `/${config.get("API_PREFIX", { infer: true })}/auth`;
	return betterAuth({
		appName: config.get("APP_NAME", { infer: true }),
		baseURL: config.get("BETTER_AUTH_URL", { infer: true }),
		basePath,
		secret: config.get("BETTER_AUTH_SECRET", { infer: true }),
		trustedOrigins: config
			.get("API_CORS_ORIGINS", { infer: true })
			.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean),
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			maxPasswordLength: 128,
		},
		hooks: {
			before: createAuthMiddleware(async (context) => {
				const path = context.path ?? "";
				if (path === "/open-api/generate-schema" && !context.request) return;
				const allowed = ALLOWED_AUTH_PATHS.some(
					(candidate) =>
						path === candidate || path === `${basePath}${candidate}`,
				);
				if (!allowed) {
					throw new APIError("NOT_FOUND", { message: "Not found" });
				}
			}),
		},
		rateLimit: {
			enabled: true,
			window: 60,
			max: 100,
			customRules: {
				"/sign-in/email": { window: 60, max: 10 },
				"/sign-up/email": { window: 60, max: 5 },
			},
		},
		advanced: {
			database: { generateId: "uuid" },
		},
		plugins: [openAPI({ disableDefaultReference: true })],
	});
}

export type ApplicationAuth = ReturnType<typeof createApplicationAuth>;
