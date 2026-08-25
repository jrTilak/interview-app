import { jest } from "@jest/globals";
import type { DatabaseLifecycleService } from "#src/db/database-lifecycle.service.js";
import { ApplicationStartupService } from "./application-startup.service.js";

describe("ApplicationStartupService", () => {
	it("runs startup work provided by imported services", async () => {
		const startup = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
		const databaseLifecycle = {
			startup,
		} as unknown as DatabaseLifecycleService;
		const service = new ApplicationStartupService(databaseLifecycle);

		await service.onApplicationBootstrap();

		expect(startup).toHaveBeenCalledTimes(1);
	});

	it("propagates a startup failure", async () => {
		const failure = new Error("database unavailable");
		const databaseLifecycle = {
			startup: jest.fn<() => Promise<void>>().mockRejectedValue(failure),
		} as unknown as DatabaseLifecycleService;
		const service = new ApplicationStartupService(databaseLifecycle);

		await expect(service.onApplicationBootstrap()).rejects.toBe(failure);
	});
});
