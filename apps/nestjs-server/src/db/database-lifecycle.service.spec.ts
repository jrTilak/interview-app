import { fileURLToPath } from "node:url";
import { jest } from "@jest/globals";
import { Logger } from "@nestjs/common";
import type { migrate as migrateDatabase } from "drizzle-orm/node-postgres/migrator";
import type { AppConfigService } from "#/types/index.js";
import type { AppDatabase } from "./database.provider.js";

const migrate = jest.fn<typeof migrateDatabase>();

jest.unstable_mockModule("drizzle-orm/node-postgres/migrator", () => ({
	migrate,
}));

const { DatabaseLifecycleService } = await import(
	"./database-lifecycle.service.js"
);

function createSubject(autoMigrate: boolean) {
	const query = jest.fn<(sql: string) => Promise<unknown>>();
	const end = jest.fn<() => Promise<void>>();
	const database = {
		$client: { query, end },
	} as unknown as AppDatabase;
	const get = jest.fn((key: string) =>
		key === "DB_AUTO_MIGRATE" ? autoMigrate : undefined,
	);
	const config = { get } as unknown as AppConfigService;

	return {
		config,
		database,
		end,
		get,
		query,
		service: new DatabaseLifecycleService(database, config),
	};
}

describe("DatabaseLifecycleService", () => {
	beforeEach(() => {
		migrate.mockReset();
		jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
	});

	afterEach(() => jest.restoreAllMocks());

	it("checks connectivity and skips migrations when auto-migrate is disabled", async () => {
		const { get, query, service } = createSubject(false);
		query.mockResolvedValue({ rows: [{ connected: 1 }] });

		await service.startup();

		expect(query).toHaveBeenCalledTimes(1);
		expect(query).toHaveBeenCalledWith("select 1");
		expect(get).toHaveBeenCalledWith("DB_AUTO_MIGRATE", { infer: true });
		expect(migrate).not.toHaveBeenCalled();
	});

	it("runs migrations only after the connectivity check when enabled", async () => {
		const { database, query, service } = createSubject(true);
		query.mockResolvedValue({ rows: [{ connected: 1 }] });
		migrate.mockResolvedValue(undefined);

		await service.startup();

		expect(migrate).toHaveBeenCalledTimes(1);
		expect(migrate).toHaveBeenCalledWith(database, {
			migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
		});
		expect(query.mock.invocationCallOrder[0]).toBeLessThan(
			migrate.mock.invocationCallOrder[0] as number,
		);
	});

	it("propagates a connectivity failure without reading migration settings", async () => {
		const failure = new Error("database unavailable");
		const { get, query, service } = createSubject(true);
		query.mockRejectedValue(failure);

		await expect(service.startup()).rejects.toBe(failure);

		expect(get).not.toHaveBeenCalled();
		expect(migrate).not.toHaveBeenCalled();
	});

	it("propagates a migration failure after a successful connectivity check", async () => {
		const failure = new Error("migration failed");
		const { query, service } = createSubject(true);
		query.mockResolvedValue({ rows: [{ connected: 1 }] });
		migrate.mockRejectedValue(failure);

		await expect(service.startup()).rejects.toBe(failure);

		expect(query).toHaveBeenCalledTimes(1);
		expect(migrate).toHaveBeenCalledTimes(1);
	});

	it("drains the PostgreSQL pool during shutdown", async () => {
		const { end, service } = createSubject(false);
		end.mockResolvedValue(undefined);

		await service.onApplicationShutdown();

		expect(end).toHaveBeenCalledTimes(1);
		expect(end).toHaveBeenCalledWith();
	});

	it("propagates a pool shutdown failure", async () => {
		const failure = new Error("pool would not close");
		const { end, service } = createSubject(false);
		end.mockRejectedValue(failure);

		await expect(service.onApplicationShutdown()).rejects.toBe(failure);
		expect(end).toHaveBeenCalledTimes(1);
	});
});
