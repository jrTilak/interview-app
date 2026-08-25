import { jest } from "@jest/globals";
import { Logger } from "@nestjs/common";
import { ShutdownLoggerService } from "./shutdown-logger.service.js";

describe("ShutdownLoggerService", () => {
	afterEach(() => jest.restoreAllMocks());

	it("records a completed shutdown without an operating-system signal", () => {
		const log = jest
			.spyOn(Logger.prototype, "log")
			.mockImplementation(() => undefined);
		const service = new ShutdownLoggerService();

		service.onApplicationShutdown();

		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith("Application shutdown completed");
	});

	it("includes the signal that initiated graceful shutdown", () => {
		const log = jest
			.spyOn(Logger.prototype, "log")
			.mockImplementation(() => undefined);
		const service = new ShutdownLoggerService();

		service.onApplicationShutdown("SIGTERM");

		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(
			"Application shutdown completed (SIGTERM)",
		);
	});
});
