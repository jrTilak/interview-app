import type { AppDatabase } from "#src/db/database.provider.js";
import type { AppConfigService } from "#src/types/index.js";
import { ALLOWED_AUTH_PATHS, createApplicationAuth } from "./auth.factory.js";

const values = {
	API_PREFIX: "v1/api",
	APP_NAME: "Interview Desk Test",
	BETTER_AUTH_URL: "http://localhost:3000",
	BETTER_AUTH_SECRET: "Test-Secret-WITH-Mixed-Entropy-123456789!",
	API_CORS_ORIGINS: "http://one.test, http://two.test ,,",
};

function config(): AppConfigService {
	return {
		get: (key: keyof typeof values) => values[key],
	} as unknown as AppConfigService;
}

describe("createApplicationAuth", () => {
	it("maps the narrow authentication and security configuration", () => {
		const auth = createApplicationAuth(config(), {} as AppDatabase);

		expect(auth.options).toMatchObject({
			appName: values.APP_NAME,
			baseURL: values.BETTER_AUTH_URL,
			basePath: "/v1/api/auth",
			secret: values.BETTER_AUTH_SECRET,
			trustedOrigins: ["http://one.test", "http://two.test"],
			emailAndPassword: {
				enabled: true,
				minPasswordLength: 8,
				maxPasswordLength: 128,
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
			advanced: { database: { generateId: "uuid" } },
		});
		expect(auth.options.plugins).toHaveLength(1);
	});

	it("allows only exact relative or configured-prefix auth paths", async () => {
		const auth = createApplicationAuth(config(), {} as AppDatabase);
		const authorizePath = auth.options.hooks?.before as unknown as (context: {
			path?: string;
			request?: Request;
		}) => Promise<void>;

		for (const path of ALLOWED_AUTH_PATHS) {
			await expect(authorizePath({ path })).resolves.toBeUndefined();
			await expect(
				authorizePath({ path: `/v1/api/auth${path}` }),
			).resolves.toBeUndefined();
		}

		for (const path of [
			undefined,
			"/sign-in/email/",
			"/admin/sign-in/email",
			"/request-password-reset",
			"/v1/api/auth/update-user",
		]) {
			await expect(authorizePath({ path })).rejects.toMatchObject({
				status: "NOT_FOUND",
				message: "Not found",
			});
		}
	});

	it("permits internal schema generation but denies its HTTP route", async () => {
		const auth = createApplicationAuth(config(), {} as AppDatabase);
		const authorizePath = auth.options.hooks?.before as unknown as (context: {
			path?: string;
			request?: Request;
		}) => Promise<void>;

		await expect(
			authorizePath({ path: "/open-api/generate-schema" }),
		).resolves.toBeUndefined();
		await expect(
			authorizePath({
				path: "/open-api/generate-schema",
				request: new Request("http://localhost/open-api/generate-schema"),
			}),
		).rejects.toMatchObject({ status: "NOT_FOUND" });
	});
});
