import { jest } from "@jest/globals";
import type { AppDatabase } from "#src/db/database.provider.js";
import { HealthService } from "./health.service.js";

function database(query: jest.Mock): AppDatabase {
	return { $client: { query } } as unknown as AppDatabase;
}

describe("HealthService", () => {
	it("returns liveness without querying PostgreSQL", () => {
		const query = jest.fn();
		const service = new HealthService(database(query));

		expect(service.health()).toEqual({
			service: "interview-api",
			status: "ok",
		});
		expect(query).not.toHaveBeenCalled();
	});

	it("checks PostgreSQL before reporting readiness", async () => {
		const query = jest
			.fn<() => Promise<unknown>>()
			.mockResolvedValue({ rows: [] });
		const service = new HealthService(database(query));

		await expect(service.readiness()).resolves.toEqual({
			service: "interview-api",
			status: "ok",
			dependencies: { database: "ok" },
		});
		expect(query).toHaveBeenCalledTimes(1);
		expect(query).toHaveBeenCalledWith("select 1");
	});

	it("propagates a PostgreSQL readiness failure", async () => {
		const failure = new Error("database unavailable");
		const query = jest.fn<() => Promise<unknown>>().mockRejectedValue(failure);
		const service = new HealthService(database(query));

		await expect(service.readiness()).rejects.toBe(failure);
	});
});
