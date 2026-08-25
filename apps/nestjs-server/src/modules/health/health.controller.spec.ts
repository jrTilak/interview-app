import { jest } from "@jest/globals";
import { ApiResponse } from "#/common/dto/api-response.dto.js";
import { HealthController } from "./health.controller.js";
import type { HealthService } from "./health.service.js";

describe("HealthController", () => {
	it("wraps the liveness service result", () => {
		const payload = {
			service: "interview-api" as const,
			status: "ok" as const,
		};
		const health = jest.fn(() => payload);
		const controller = new HealthController({
			health,
		} as unknown as HealthService);

		expect(controller.health()).toEqual(new ApiResponse({ data: payload }));
		expect(health).toHaveBeenCalledTimes(1);
	});

	it("awaits and wraps the readiness service result", async () => {
		const payload = {
			service: "interview-api" as const,
			status: "ok" as const,
			dependencies: { database: "ok" as const },
		};
		const readiness = jest
			.fn<() => Promise<typeof payload>>()
			.mockResolvedValue(payload);
		const controller = new HealthController({
			readiness,
		} as unknown as HealthService);

		await expect(controller.readiness()).resolves.toEqual(
			new ApiResponse({ data: payload }),
		);
	});

	it("does not replace a readiness failure", async () => {
		const failure = new Error("database unavailable");
		const readiness = jest
			.fn<() => Promise<never>>()
			.mockRejectedValue(failure);
		const controller = new HealthController({
			readiness,
		} as unknown as HealthService);

		await expect(controller.readiness()).rejects.toBe(failure);
	});
});
