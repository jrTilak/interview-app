import z from "zod";
import {
	booleanEnvironment,
	integerEnvironment,
} from "../common/validation/environment-value.js";

const BaseEnvironmentSchema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	PORT: integerEnvironment({ defaultValue: 3000, minimum: 1, maximum: 65_535 }),
	APP_NAME: z.string().trim().min(1).default("Interview App"),
	APP_WEB_URL: z.url().default("http://localhost:5173"),
	API_PREFIX: z
		.string()
		.trim()
		.regex(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/)
		.default("api"),
	API_CORS_ORIGINS: z
		.string()
		.trim()
		.min(1)
		.default("http://localhost:5173,http://127.0.0.1:5173"),
	API_DOCS_FILE_PATH: z.string().trim().min(1).default("docs/api-info.md"),
	SWAGGER_ENABLE: booleanEnvironment.default(true),

	BETTER_AUTH_SECRET: z.string().min(32),
	BETTER_AUTH_URL: z.url(),

	DB_HOST: z.string().trim().min(1),
	DB_PORT: integerEnvironment({
		defaultValue: 5432,
		minimum: 1,
		maximum: 65_535,
	}),
	DB_NAME: z.string().trim().min(1),
	DB_USERNAME: z.string().trim().min(1),
	DB_PASSWORD: z.string(),
	DB_CONNECT_TIMEOUT_MS: integerEnvironment({
		defaultValue: 10_000,
		minimum: 1_000,
		maximum: 60_000,
	}),
	DB_AUTO_MIGRATE: booleanEnvironment.default(false),
	PGSSLMODE: z
		.enum([
			"disable",
			"prefer",
			"require",
			"verify-ca",
			"verify-full",
			"no-verify",
		])
		.optional(),

	GEMINI_API_KEY: z.string().trim().min(20),
	GEMINI_LLM_MODEL: z.string().trim().min(1).default("gemini-3.6-flash"),
	GEMINI_STT_MODEL: z.string().trim().min(1).default("gemini-3.6-flash"),
	GEMINI_TTS_MODEL: z
		.string()
		.trim()
		.min(1)
		.default("gemini-3.1-flash-tts-preview"),
	GEMINI_TTS_VOICE: z.string().trim().min(1).default("Kore"),
	GEMINI_TIMEOUT_MS: integerEnvironment({
		defaultValue: 45_000,
		minimum: 5_000,
		maximum: 120_000,
	}),
	TTS_PROVIDER: z.enum(["gemini", "local"]).default("gemini"),
	LOCAL_TTS_URL: z.url().default("http://127.0.0.1:8001"),
	LOCAL_TTS_VOICE: z.string().trim().min(1).default("professional-default"),
	LOCAL_TTS_TIMEOUT_MS: integerEnvironment({
		defaultValue: 45_000,
		minimum: 1_000,
		maximum: 120_000,
	}),

	AUDIO_SILENCE_MS: integerEnvironment({
		defaultValue: 1_800,
		minimum: 500,
		maximum: 10_000,
	}),
	AUDIO_MAX_BYTES: integerEnvironment({
		defaultValue: 10 * 1024 * 1024,
		minimum: 1_024,
		maximum: 12 * 1024 * 1024,
	}),
	MEDIA_MAX_CHUNK_BYTES: integerEnvironment({
		defaultValue: 512 * 1024,
		minimum: 1_024,
		maximum: 1024 * 1024,
	}),
});

export const EnvironmentSchema = BaseEnvironmentSchema.loose();
export type Environment = z.output<typeof BaseEnvironmentSchema>;

/** Validates and normalizes the complete process environment at startup. */
export function validateEnvironment(
	config: Record<string, unknown>,
): Environment {
	const result = EnvironmentSchema.safeParse(config);
	if (!result.success) throw new Error(z.prettifyError(result.error));
	return result.data;
}
