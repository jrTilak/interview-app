import { EnvironmentSchema } from "./environment.schema.js";

const validEnvironment = {
	NODE_ENV: "test",
	BETTER_AUTH_SECRET: "12345678901234567890123456789012",
	BETTER_AUTH_URL: "http://localhost:3000",
	DB_HOST: "localhost",
	DB_NAME: "interview_app_test",
	DB_USERNAME: "interview_app",
	DB_PASSWORD: "interview_app",
};

describe("EnvironmentSchema", () => {
	it("applies bounded defaults and typed booleans", () => {
		const result = EnvironmentSchema.parse(validEnvironment);

		expect(result.PORT).toBe(3000);
		expect(result.SWAGGER_ENABLE).toBe(true);
		expect(result.DEV_TOOLS_ENABLED).toBe(false);
		expect(result.DB_AUTO_MIGRATE).toBe(false);
		expect(result.AUDIO_SILENCE_MS).toBe(1800);
		expect(result.LOCAL_LLM_URL).toBe("http://127.0.0.1:8003");
		expect(result.LOCAL_LLM_TIMEOUT_MS).toBe(120_000);
		expect(result.LOCAL_STT_URL).toBe("http://127.0.0.1:8002");
		expect(result.LOCAL_STT_TIMEOUT_MS).toBe(45_000);
		expect(result.LOCAL_TTS_URL).toBe("http://127.0.0.1:8001");
		expect(result.LOCAL_TTS_VOICE).toBe("professional-default");
		expect(result.LOCAL_TTS_TIMEOUT_MS).toBe(45_000);
		expect(result.API_CORS_ORIGINS).toBe(
			"http://localhost:5173,http://127.0.0.1:5173",
		);
	});

	it("converts explicit string settings", () => {
		const result = EnvironmentSchema.parse({
			...validEnvironment,
			PORT: "4567",
			SWAGGER_ENABLE: "false",
			DEV_TOOLS_ENABLED: "true",
			DB_AUTO_MIGRATE: "true",
			AUDIO_MAX_BYTES: "4096",
			LOCAL_LLM_URL: "http://llm:9002",
			LOCAL_LLM_TIMEOUT_MS: "90000",
			LOCAL_STT_URL: "http://stt:9001",
			LOCAL_STT_TIMEOUT_MS: "25000",
			LOCAL_TTS_URL: "http://tts:9000",
			LOCAL_TTS_VOICE: "warm-female",
			LOCAL_TTS_TIMEOUT_MS: "30000",
		});

		expect(result.PORT).toBe(4567);
		expect(result.SWAGGER_ENABLE).toBe(false);
		expect(result.DEV_TOOLS_ENABLED).toBe(true);
		expect(result.DB_AUTO_MIGRATE).toBe(true);
		expect(result.AUDIO_MAX_BYTES).toBe(4096);
		expect(result.LOCAL_LLM_URL).toBe("http://llm:9002");
		expect(result.LOCAL_LLM_TIMEOUT_MS).toBe(90_000);
		expect(result.LOCAL_STT_URL).toBe("http://stt:9001");
		expect(result.LOCAL_STT_TIMEOUT_MS).toBe(25_000);
		expect(result.LOCAL_TTS_URL).toBe("http://tts:9000");
		expect(result.LOCAL_TTS_VOICE).toBe("warm-female");
		expect(result.LOCAL_TTS_TIMEOUT_MS).toBe(30_000);
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

	it.each(["999", "120001"])(
		"rejects the out-of-range local LLM timeout %s",
		(LOCAL_LLM_TIMEOUT_MS) => {
			expect(() =>
				EnvironmentSchema.parse({
					...validEnvironment,
					LOCAL_LLM_TIMEOUT_MS,
				}),
			).toThrow();
		},
	);

	it.each(["999", "120001"])(
		"rejects the out-of-range local STT timeout %s",
		(LOCAL_STT_TIMEOUT_MS) => {
			expect(() =>
				EnvironmentSchema.parse({
					...validEnvironment,
					LOCAL_STT_TIMEOUT_MS,
				}),
			).toThrow();
		},
	);

	it.each(["999", "120001"])(
		"rejects the out-of-range local TTS timeout %s",
		(LOCAL_TTS_TIMEOUT_MS) => {
			expect(() =>
				EnvironmentSchema.parse({
					...validEnvironment,
					LOCAL_TTS_TIMEOUT_MS,
				}),
			).toThrow();
		},
	);
});
