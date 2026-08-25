import {
	devFlagsControllerRead as getDevFlags,
	devFlagsControllerUpdate as updateDevFlags,
} from "@/shared/api/generated/application/development-flags/development-flags";

export type UpdateDevFlagsInput = Parameters<typeof updateDevFlags>[0];
export type UpdateDevFlagsOutput = Awaited<ReturnType<typeof updateDevFlags>>;
export { updateDevFlags };

export type GetDevFlagsOutput = Awaited<ReturnType<typeof getDevFlags>>;
export type DevFlags = GetDevFlagsOutput["data"];
export { getDevFlags };

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
