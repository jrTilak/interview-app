import { jest } from "@jest/globals";
import { Logger } from "@nestjs/common";
import { Pool } from "pg";
import {
	DATABASE_CONFIG,
	type DatabaseConfig,
} from "#/config/database.config.js";
import {
	type AppDatabase,
	DATABASE,
	databaseProvider,
} from "./database.provider.js";

const poolConfig: DatabaseConfig = {
	application_name: "Interview Desk Test",
	database: "interview_desk_test",
	host: "127.0.0.1",
	password: "secret",
	port: 55432,
	user: "interview_desk",
};

const createdPools: Pool[] = [];

function createDatabase(config: DatabaseConfig): AppDatabase {
	const factory = databaseProvider.useFactory as (
		value: DatabaseConfig,
	) => AppDatabase;
	const database = factory(config);
	createdPools.push(database.$client);
	return database;
}

describe("databaseProvider", () => {
	afterEach(async () => {
		jest.restoreAllMocks();
		await Promise.all(createdPools.splice(0).map((pool) => pool.end()));
	});

	it("creates a Drizzle database around a configured PostgreSQL pool", () => {
		const database = createDatabase(poolConfig);

		expect(databaseProvider.provide).toBe(DATABASE);
		expect(databaseProvider.inject).toEqual([DATABASE_CONFIG]);
		expect(database.$client).toBeInstanceOf(Pool);
		expect(database.$client.options).toMatchObject(poolConfig);
		expect(database.$client.listenerCount("error")).toBeGreaterThan(0);
		expect(database.query).toEqual(
			expect.objectContaining({
				account: expect.anything(),
				interview: expect.anything(),
				interviewQuestion: expect.anything(),
				session: expect.anything(),
				user: expect.anything(),
				verification: expect.anything(),
			}),
		);
	});

	it("logs an idle pool error without throwing it", () => {
		const logError = jest
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => undefined);
		const database = createDatabase(poolConfig);
		const failure = new Error("idle connection failed");

		expect(() => database.$client.emit("error", failure)).not.toThrow();
		expect(logError).toHaveBeenCalledWith(
			"An idle PostgreSQL connection failed; readiness will report the outage",
			failure.stack,
		);
	});
});
