import { apiClient } from "@/shared/api/client";
import { requireResponseData } from "@/shared/api/response";

export type DevFlags = {
	faceDetectionEnabled: boolean;
	requireSingleFaceToStart: boolean;
	pauseOnNoFace: boolean;
	pauseOnMultipleFaces: boolean;
	terminateOnNoFace: boolean;
	terminateOnMultipleFaces: boolean;
	streamCameraToServer: boolean;
	streamScreenToServer: boolean;
	requireWholeScreen: boolean;
};

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

type DevFlagsEnvelope = { data?: DevFlags };

export async function getDevFlags(): Promise<DevFlags> {
	return requireResponseData(
		await apiClient<DevFlagsEnvelope>({ method: "GET", url: "/api/__flags__" }),
	);
}

export async function updateDevFlags(
	changes: Partial<DevFlags>,
): Promise<DevFlags> {
	return requireResponseData(
		await apiClient<DevFlagsEnvelope>({
			data: changes,
			method: "PATCH",
			url: "/api/__flags__",
		}),
	);
}
