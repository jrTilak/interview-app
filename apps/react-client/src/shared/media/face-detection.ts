import { FaceDetector, type FaceDetectorResult } from "@mediapipe/tasks-vision";
import visionWasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import visionWasmUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import { useEffect, useState } from "react";
import modelAssetUrl from "./models/blaze_face_short_range.tflite?url";

export type FaceBox = {
	height: number;
	width: number;
	x: number;
	y: number;
};

export type FaceDetectionSnapshot = {
	boxes: FaceBox[];
	count: number | null;
	error: string | null;
	height: number;
	status:
		| "disabled"
		| "initializing"
		| "no-face"
		| "single"
		| "multiple"
		| "error";
	width: number;
};

const EMPTY: FaceDetectionSnapshot = {
	boxes: [],
	count: null,
	error: null,
	height: 0,
	status: "initializing",
	width: 0,
};

let detectorPromise: Promise<FaceDetector> | undefined;

function getDetector(): Promise<FaceDetector> {
	detectorPromise ??= FaceDetector.createFromOptions(
		{
			wasmBinaryPath: visionWasmUrl,
			wasmLoaderPath: visionWasmLoaderUrl,
		},
		{
			baseOptions: { modelAssetPath: modelAssetUrl },
			minDetectionConfidence: 0.65,
			minSuppressionThreshold: 0.3,
			runningMode: "VIDEO",
		},
	);
	return detectorPromise;
}

function category(count: number): "no-face" | "single" | "multiple" {
	if (count === 0) return "no-face";
	if (count === 1) return "single";
	return "multiple";
}

function boxesFromResult(result: FaceDetectorResult): FaceBox[] {
	return result.detections.flatMap((detection) => {
		const box = detection.boundingBox;
		return box
			? [
					{
						height: box.height,
						width: box.width,
						x: box.originX,
						y: box.originY,
					},
				]
			: [];
	});
}

/** Runs a throttled, entirely client-side face detector over the camera stream. */
export function useFaceDetection(
	stream: MediaStream | null,
	enabled: boolean,
): FaceDetectionSnapshot {
	const [snapshot, setSnapshot] = useState<FaceDetectionSnapshot>(
		enabled ? EMPTY : { ...EMPTY, status: "disabled" },
	);

	useEffect(() => {
		if (!enabled) {
			setSnapshot({ ...EMPTY, status: "disabled" });
			return;
		}
		if (!stream) {
			setSnapshot(EMPTY);
			return;
		}

		let disposed = false;
		let interval: number | undefined;
		let pendingCategory: ReturnType<typeof category> | undefined;
		let pendingCount = 0;
		const video = document.createElement("video");
		video.muted = true;
		video.playsInline = true;
		video.srcObject = stream;
		setSnapshot(EMPTY);

		void (async () => {
			try {
				const detector = await getDetector();
				await video.play();
				if (disposed) return;
				const detect = () => {
					if (
						disposed ||
						video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
					) {
						return;
					}
					const result = detector.detectForVideo(video, performance.now());
					const count = result.detections.length;
					const nextCategory = category(count);
					if (pendingCategory === nextCategory) pendingCount += 1;
					else {
						pendingCategory = nextCategory;
						pendingCount = 1;
					}
					if (pendingCount < 2) return;
					setSnapshot({
						boxes: boxesFromResult(result),
						count,
						error: null,
						height: video.videoHeight,
						status: nextCategory,
						width: video.videoWidth,
					});
				};
				detect();
				interval = window.setInterval(detect, 450);
			} catch (error) {
				if (disposed) return;
				setSnapshot({
					...EMPTY,
					error:
						error instanceof Error
							? error.message
							: "Face detection could not start.",
					status: "error",
				});
			}
		})();

		return () => {
			disposed = true;
			if (interval !== undefined) window.clearInterval(interval);
			video.pause();
			video.srcObject = null;
		};
	}, [enabled, stream]);

	return snapshot;
}
