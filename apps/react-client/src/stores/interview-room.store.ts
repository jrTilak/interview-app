import { create } from "zustand";
import type { RealtimeErrorPayload } from "@/shared/realtime/protocol";

export type RoomConnectionStatus =
	| "idle"
	| "connecting"
	| "connected"
	| "disconnected";

export type RoomPlaybackStatus = "idle" | "buffering" | "playing";
export type RoomCaptureStatus = "idle" | "starting" | "active" | "stopping";
export type RoomCaptureKind = "camera" | "screen" | "microphone";

export type InterviewRoomState = {
	connection: {
		status: RoomConnectionStatus;
		joinedAttemptId: string | null;
	};
	playback: {
		status: RoomPlaybackStatus;
		turnId: string | null;
		lastSequence: number;
	};
	capture: {
		status: Record<RoomCaptureKind, RoomCaptureStatus>;
		microphoneTurnId: string | null;
		nextMicrophoneSequence: number;
	};
	lastError: RealtimeErrorPayload | null;
};

type InterviewRoomActions = {
	setConnectionStatus: (status: RoomConnectionStatus) => void;
	setJoinedAttemptId: (attemptId: string | null) => void;
	beginPlayback: (turnId: string) => void;
	markPlaybackChunk: (turnId: string, sequence: number) => void;
	finishPlayback: (turnId: string) => void;
	setCaptureStatus: (kind: RoomCaptureKind, status: RoomCaptureStatus) => void;
	beginMicrophoneTurn: (turnId: string) => void;
	markMicrophoneChunkSent: (turnId: string, sequence: number) => void;
	finishMicrophoneTurn: (turnId: string) => void;
	setLastError: (error: RealtimeErrorPayload | null) => void;
	reset: () => void;
};

export type InterviewRoomStore = InterviewRoomState & InterviewRoomActions;

/** Returns fresh room UI state without durable interview data or media bytes. */
export function createInitialInterviewRoomState(): InterviewRoomState {
	return {
		connection: { status: "idle", joinedAttemptId: null },
		playback: { status: "idle", turnId: null, lastSequence: -1 },
		capture: {
			status: { camera: "idle", screen: "idle", microphone: "idle" },
			microphoneTurnId: null,
			nextMicrophoneSequence: 0,
		},
		lastError: null,
	};
}

/** Ephemeral coordination only; server snapshots remain in TanStack Query. */
export const useInterviewRoomStore = create<InterviewRoomStore>()((set) => ({
	...createInitialInterviewRoomState(),
	setConnectionStatus: (status) =>
		set((state) => ({
			connection: { ...state.connection, status },
		})),
	setJoinedAttemptId: (joinedAttemptId) =>
		set((state) => ({
			connection: { ...state.connection, joinedAttemptId },
		})),
	beginPlayback: (turnId) =>
		set({
			playback: { status: "buffering", turnId, lastSequence: -1 },
		}),
	markPlaybackChunk: (turnId, sequence) =>
		set((state) => {
			if (
				state.playback.turnId !== turnId ||
				sequence <= state.playback.lastSequence
			) {
				return state;
			}
			return {
				playback: { status: "playing", turnId, lastSequence: sequence },
			};
		}),
	finishPlayback: (turnId) =>
		set((state) =>
			state.playback.turnId === turnId
				? {
						playback: {
							status: "idle",
							turnId: null,
							lastSequence: -1,
						},
					}
				: state,
		),
	setCaptureStatus: (kind, status) =>
		set((state) => ({
			capture: {
				...state.capture,
				status: { ...state.capture.status, [kind]: status },
			},
		})),
	beginMicrophoneTurn: (microphoneTurnId) =>
		set((state) => ({
			capture: {
				...state.capture,
				status: { ...state.capture.status, microphone: "active" },
				microphoneTurnId,
				nextMicrophoneSequence: 0,
			},
		})),
	markMicrophoneChunkSent: (turnId, sequence) =>
		set((state) => {
			if (
				state.capture.microphoneTurnId !== turnId ||
				state.capture.nextMicrophoneSequence !== sequence
			) {
				return state;
			}
			return {
				capture: {
					...state.capture,
					nextMicrophoneSequence: sequence + 1,
				},
			};
		}),
	finishMicrophoneTurn: (turnId) =>
		set((state) =>
			state.capture.microphoneTurnId === turnId
				? {
						capture: {
							...state.capture,
							status: {
								...state.capture.status,
								microphone: "idle",
							},
							microphoneTurnId: null,
							nextMicrophoneSequence: 0,
						},
					}
				: state,
		),
	setLastError: (lastError) => set({ lastError }),
	reset: () => set(createInitialInterviewRoomState()),
}));
