import z from "zod";

export const DevFlagsSchema = z
	.object({
		faceDetectionEnabled: z.boolean(),
		requireSingleFaceToStart: z.boolean(),
		pauseOnNoFace: z.boolean(),
		pauseOnMultipleFaces: z.boolean(),
		terminateOnNoFace: z.boolean(),
		terminateOnMultipleFaces: z.boolean(),
		streamCameraToServer: z.boolean(),
		streamScreenToServer: z.boolean(),
		requireWholeScreen: z.boolean(),
	})
	.strict();

export type DevFlags = z.infer<typeof DevFlagsSchema>;

export const DEFAULT_DEV_FLAGS: DevFlags = {
	faceDetectionEnabled: true,
	requireSingleFaceToStart: true,
	pauseOnNoFace: true,
	pauseOnMultipleFaces: true,
	terminateOnNoFace: false,
	terminateOnMultipleFaces: false,
	streamCameraToServer: false,
	streamScreenToServer: false,
	requireWholeScreen: true,
};

export const UpdateDevFlagsSchema = DevFlagsSchema.partial().refine(
	(value) => Object.keys(value).length > 0,
	{ message: "At least one feature flag must be updated" },
);
