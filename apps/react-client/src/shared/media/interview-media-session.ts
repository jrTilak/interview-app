import { useSyncExternalStore } from "react";
import { CompletedAudioTurnPlayer } from "./raw-pcm-audio-player.js";

export type InterviewMediaSnapshot = {
	cameraActive: boolean;
	cameraStream: MediaStream | null;
	microphoneActive: boolean;
	screenActive: boolean;
	screenStream: MediaStream | null;
};

const EMPTY_MEDIA_SNAPSHOT: InterviewMediaSnapshot = {
	cameraActive: false,
	cameraStream: null,
	microphoneActive: false,
	screenActive: false,
	screenStream: null,
};

/** Owns browser tracks across the lobby-to-live route handoff only. */
export class InterviewMediaSession {
	private readonly _listeners = new Set<() => void>();
	private _snapshot = EMPTY_MEDIA_SNAPSHOT;

	getSnapshot = (): InterviewMediaSnapshot => this._snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	};

	/** Requests camera and microphone together from an explicit desktop gesture. */
	async acquireCameraAndMicrophone(): Promise<MediaStream> {
		if (!navigator.mediaDevices?.getUserMedia) {
			throw new Error("Camera and microphone capture are unavailable.");
		}
		this._stopStream(this._snapshot.cameraStream);
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				autoGainControl: true,
				channelCount: { ideal: 1 },
				echoCancellation: true,
				noiseSuppression: true,
			},
			video: {
				frameRate: { ideal: 24, max: 30 },
				height: { ideal: 720 },
				width: { ideal: 1280 },
			},
		});
		for (const track of stream.getTracks()) {
			track.addEventListener("ended", this._refreshTrackState, { once: true });
		}
		this._setSnapshot({ ...this._snapshot, cameraStream: stream });
		this._refreshTrackState();
		return stream;
	}

	/** Requests a display surface from a second explicit desktop gesture. */
	async acquireScreen(): Promise<MediaStream> {
		if (!navigator.mediaDevices?.getDisplayMedia) {
			throw new Error("Screen sharing is unavailable in this browser.");
		}
		this._stopStream(this._snapshot.screenStream);
		const stream = await navigator.mediaDevices.getDisplayMedia({
			audio: false,
			video: { displaySurface: "monitor", frameRate: { ideal: 12, max: 15 } },
		});
		for (const track of stream.getTracks()) {
			track.addEventListener("ended", this._refreshTrackState, { once: true });
		}
		this._setSnapshot({ ...this._snapshot, screenStream: stream });
		this._refreshTrackState();
		return stream;
	}

	/** Stops every device track and clears the route handoff state. */
	stopAll(): void {
		this._stopStream(this._snapshot.cameraStream);
		this._stopStream(this._snapshot.screenStream);
		this._setSnapshot(EMPTY_MEDIA_SNAPSHOT);
	}

	private readonly _refreshTrackState = (): void => {
		const cameraStream = this._snapshot.cameraStream;
		const screenStream = this._snapshot.screenStream;
		this._setSnapshot({
			cameraActive:
				cameraStream
					?.getVideoTracks()
					.some((track) => track.readyState === "live") ?? false,
			cameraStream,
			microphoneActive:
				cameraStream
					?.getAudioTracks()
					.some((track) => track.readyState === "live") ?? false,
			screenActive:
				screenStream
					?.getVideoTracks()
					.some((track) => track.readyState === "live") ?? false,
			screenStream,
		});
	};

	private _setSnapshot(snapshot: InterviewMediaSnapshot): void {
		this._snapshot = snapshot;
		for (const listener of this._listeners) listener();
	}

	private _stopStream(stream: MediaStream | null): void {
		for (const track of stream?.getTracks() ?? []) track.stop();
	}
}

export const interviewMediaSession = new InterviewMediaSession();

/** Plays each completed server-provided WAV through native browser decoding. */
export const interviewAudioPlayer = new CompletedAudioTurnPlayer();

/** Subscribes React UI to track readiness without persisting stream objects. */
export function useInterviewMediaSession(): InterviewMediaSnapshot {
	return useSyncExternalStore(
		interviewMediaSession.subscribe,
		interviewMediaSession.getSnapshot,
		() => EMPTY_MEDIA_SNAPSHOT,
	);
}
