import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import { ApiResponse } from "#src/common/dto/api-response.dto.js";
import type { AppConfigService } from "#src/types/index.js";
import { DevFlagsController } from "./dev-flags.controller.js";
import { DEFAULT_DEV_FLAGS } from "./dev-flags.schema.js";
import type { DevFlagsService } from "./dev-flags.service.js";

function config(enabled: boolean | undefined): AppConfigService {
	return {
		get: jest.fn(() => enabled),
	} as unknown as AppConfigService;
}

describe("DevFlagsController", () => {
	it("wraps enabled reads and partial updates", () => {
		const updated = { ...DEFAULT_DEV_FLAGS, streamCameraToServer: true };
		const flags = {
			get: jest.fn(() => ({ ...DEFAULT_DEV_FLAGS })),
			update: jest.fn(() => updated),
		} as unknown as DevFlagsService;
		const controller = new DevFlagsController(flags, config(true));

		expect(controller.read()).toEqual(
			new ApiResponse({ data: DEFAULT_DEV_FLAGS }),
		);
		expect(controller.update({ streamCameraToServer: true })).toEqual(
			new ApiResponse({ data: updated }),
		);
		expect(flags.update).toHaveBeenCalledWith({ streamCameraToServer: true });
	});

	it.each([false, undefined])(
		"hides reads and updates when DEV_TOOLS_ENABLED is %s",
		(enabled) => {
			const flags = {
				get: jest.fn(),
				update: jest.fn(),
			} as unknown as DevFlagsService;
			const controller = new DevFlagsController(flags, config(enabled));

			expect(() => controller.read()).toThrow(NotFoundException);
			expect(() => controller.update({ streamCameraToServer: true })).toThrow(
				NotFoundException,
			);
			expect(flags.get).not.toHaveBeenCalled();
			expect(flags.update).not.toHaveBeenCalled();
		},
	);

	it("propagates a service failure", () => {
		const failure = new Error("flag store failed");
		const flags = {
			get: jest.fn(() => {
				throw failure;
			}),
		} as unknown as DevFlagsService;
		const controller = new DevFlagsController(flags, config(true));

		expect(() => controller.read()).toThrow(failure);
	});
});
