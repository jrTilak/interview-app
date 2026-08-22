import { DEFAULT_DEV_FLAGS, UpdateDevFlagsSchema } from "./dev-flags.schema.js";
import { DevFlagsService } from "./dev-flags.service.js";

describe("DevFlagsService", () => {
	it("owns one mutable process-wide snapshot without exposing its reference", () => {
		const service = new DevFlagsService();

		expect(service.get()).toEqual(DEFAULT_DEV_FLAGS);
		expect(
			service.update({
				streamCameraToServer: true,
				terminateOnNoFace: true,
			}),
		).toMatchObject({
			streamCameraToServer: true,
			terminateOnNoFace: true,
		});

		const read = service.get();
		read.streamCameraToServer = false;
		expect(service.get().streamCameraToServer).toBe(true);
	});

	it("rejects empty and unknown flag changes at the boundary", () => {
		expect(UpdateDevFlagsSchema.safeParse({}).success).toBe(false);
		expect(UpdateDevFlagsSchema.safeParse({ unknownFlag: true }).success).toBe(
			false,
		);
	});
});
