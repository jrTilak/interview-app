import { jest } from "@jest/globals";
import { ConfigService } from "@nestjs/config";
import type { AppConfigService } from "#/types/index.js";
import {
	DATABASE_CONFIG,
	type DatabaseConfig,
	databaseConfigProvider,
} from "./database.config.js";

const baseValues: Record<string, unknown> = {
	APP_NAME: "Interview Desk Test",
	DB_CONNECT_TIMEOUT_MS: 7_500,
	DB_HOST: "database.internal",
	DB_NAME: "interview_test",
	DB_PASSWORD: "test-password",
	DB_PORT: 5_432,
	DB_USERNAME: "interview_user",
};

function createConfig(overrides: Record<string, unknown> = {}) {
	const values = { ...baseValues, ...overrides };
	const get = jest.fn((key: string) => values[key]);
	return {
		config: { get } as unknown as AppConfigService,
		get,
	};
}

const createDatabaseConfig = databaseConfigProvider.useFactory as (
	config: AppConfigService,
) => DatabaseConfig;

describe("databaseConfigProvider", () => {
	it("maps validated application settings to the PostgreSQL pool", () => {
		const { config } = createConfig({ PGSSLMODE: "disable" });

		expect(createDatabaseConfig(config)).toEqual({
			application_name: "Interview Desk Test",
			connectionTimeoutMillis: 7_500,
			database: "interview_test",
			host: "database.internal",
			keepAlive: true,
			password: "test-password",
			port: 5_432,
			ssl: false,
			user: "interview_user",
		});
	});

	it.each([
		{ mode: undefined, ssl: undefined },
		{ mode: "disable", ssl: false },
		{ mode: "no-verify", ssl: { rejectUnauthorized: false } },
		{ mode: "prefer", ssl: { rejectUnauthorized: true } },
		{ mode: "require", ssl: { rejectUnauthorized: true } },
		{ mode: "verify-ca", ssl: { rejectUnauthorized: true } },
		{ mode: "verify-full", ssl: { rejectUnauthorized: true } },
	])("maps the $mode SSL mode to the expected pool option", ({ mode, ssl }) => {
		const { config } = createConfig({ PGSSLMODE: mode });

		expect(createDatabaseConfig(config).ssl).toEqual(ssl);
	});

	it("publishes the factory under the database configuration token", () => {
		expect(databaseConfigProvider.provide).toBe(DATABASE_CONFIG);
		expect(databaseConfigProvider.inject).toEqual([ConfigService]);
	});
});
