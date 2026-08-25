import { beforeEach, describe, expect, it } from "vitest";
import {
	createInitialInterviewRoomState,
	useInterviewRoomStore,
} from "./interview-room.store";

const assistantTurnId = "19ad8c03-9e89-4d23-b393-d3cd6a654900";
const microphoneTurnId = "83e0c06d-cbbf-47db-80fe-9da1bc4d37b0";

describe("interview room store", () => {
	beforeEach(() => useInterviewRoomStore.getState().reset());

	it("starts with only ephemeral connection, playback, capture, and error state", () => {
		const state = useInterviewRoomStore.getState();

		expect({
			connection: state.connection,
			playback: state.playback,
			capture: state.capture,
			lastError: state.lastError,
		}).toEqual(createInitialInterviewRoomState());
		expect(state).not.toHaveProperty("snapshot");
		expect(state).not.toHaveProperty("transcript");
		expect(state).not.toHaveProperty("audioChunks");
	});

	it("updates connection and playback while ignoring stale turn chunks", () => {
		const actions = useInterviewRoomStore.getState();
		actions.setConnectionStatus("connected");
		actions.setJoinedAttemptId("f0c765b0-a9fe-4a67-bf75-a63486949831");
		actions.beginPlayback(assistantTurnId);
		actions.markPlaybackChunk("wrong-turn", 0);
		actions.markPlaybackChunk(assistantTurnId, 0);
		actions.markPlaybackChunk(assistantTurnId, 0);

		expect(useInterviewRoomStore.getState()).toMatchObject({
			connection: {
				status: "connected",
				joinedAttemptId: "f0c765b0-a9fe-4a67-bf75-a63486949831",
			},
			playback: {
				status: "playing",
				turnId: assistantTurnId,
				lastSequence: 0,
			},
		});

		actions.finishPlayback("wrong-turn");
		expect(useInterviewRoomStore.getState().playback.status).toBe("playing");
		actions.finishPlayback(assistantTurnId);
		expect(useInterviewRoomStore.getState().playback).toEqual(
			createInitialInterviewRoomState().playback,
		);
	});

	it("advances microphone sequence only for the active ordered turn", () => {
		const actions = useInterviewRoomStore.getState();
		actions.setCaptureStatus("camera", "active");
		actions.setCaptureStatus("screen", "starting");
		actions.beginMicrophoneTurn(microphoneTurnId);
		actions.markMicrophoneChunkSent(microphoneTurnId, 1);
		actions.markMicrophoneChunkSent("wrong-turn", 0);
		actions.markMicrophoneChunkSent(microphoneTurnId, 0);

		expect(useInterviewRoomStore.getState().capture).toEqual({
			status: { camera: "active", screen: "starting", microphone: "active" },
			microphoneTurnId,
			nextMicrophoneSequence: 1,
		});

		actions.finishMicrophoneTurn("wrong-turn");
		expect(useInterviewRoomStore.getState().capture.microphoneTurnId).toBe(
			microphoneTurnId,
		);
		actions.finishMicrophoneTurn(microphoneTurnId);
		expect(useInterviewRoomStore.getState().capture).toEqual({
			status: { camera: "active", screen: "starting", microphone: "idle" },
			microphoneTurnId: null,
			nextMicrophoneSequence: 0,
		});
	});

	it("resets every ephemeral value while retaining stable actions", () => {
		const actions = useInterviewRoomStore.getState();
		const reset = actions.reset;
		actions.setConnectionStatus("disconnected");
		actions.beginPlayback(assistantTurnId);
		actions.beginMicrophoneTurn(microphoneTurnId);
		actions.setLastError({
			code: "AUDIO_UNAVAILABLE",
			message: "Use subtitles",
			retryable: true,
		});

		reset();
		const state = useInterviewRoomStore.getState();
		expect({
			connection: state.connection,
			playback: state.playback,
			capture: state.capture,
			lastError: state.lastError,
		}).toEqual(createInitialInterviewRoomState());
		expect(state.reset).toBe(reset);
	});
});
