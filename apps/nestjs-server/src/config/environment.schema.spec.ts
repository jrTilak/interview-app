import { EnvironmentSchema } from "./environment.schema.js";

const validEnvironment = {
	NODE_ENV: "test",
	BETTER_AUTH_SECRET: "12345678901234567890123456789012",
	BETTER_AUTH_URL: "http://localhost:3000",
	DB_HOST: "localhost",
	DB_NAME: "interview_app_test",
	DB_USERNAME: "interview_app",
	DB_PASSWORD: "interview_app",
	GEMINI_API_KEY: "12345678901234567890",
};

describe("EnvironmentSchema", () => {
	it("applies bounded defaults and typed booleans", () => {
		const result = EnvironmentSchema.parse(validEnvironment);

		expect(result.PORT).toBe(3000);
		expect(result.SWAGGER_ENABLE).toBe(true);
		expect(result.DB_AUTO_MIGRATE).toBe(false);
		expect(result.AUDIO_SILENCE_MS).toBe(1800);
		expect(result.GEMINI_LLM_MODEL).toBe("gemini-3.6-flash");
	});

	it("converts explicit string settings", () => {
		const result = EnvironmentSchema.parse({
			...validEnvironment,
			PORT: "4567",
			SWAGGER_ENABLE: "false",
			DB_AUTO_MIGRATE: "true",
			AUDIO_MAX_BYTES: "4096",
		});

		expect(result.PORT).toBe(4567);
		expect(result.SWAGGER_ENABLE).toBe(false);
		expect(result.DB_AUTO_MIGRATE).toBe(true);
		expect(result.AUDIO_MAX_BYTES).toBe(4096);
	});

	it("rejects short secrets and unsafe numeric ranges", () => {
		expect(() =>
			EnvironmentSchema.parse({
				...validEnvironment,
				BETTER_AUTH_SECRET: "too-short",
				AUDIO_SILENCE_MS: "100",
			}),
		).toThrow();
	});
});
