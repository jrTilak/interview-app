import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DisposableMediaStreamer,
	pauseDisposableMediaStreamers,
	resumeDisposableMediaStreamers,
} from "./disposable-media-streamer";
import type { InterviewSocket } from "./protocol";

class FakeMediaRecorder extends EventTarget {
	static last?: FakeMediaRecorder;
	state: RecordingState = "inactive";
	readonly pause = vi.fn(() => {
		this.state = "paused";
	});
	readonly resume = vi.fn(() => {
		this.state = "recording";
	});

	constructor() {
		super();
		FakeMediaRecorder.last = this;
	}

	static isTypeSupported(): boolean {
		return true;
	}

	start(): void {
		this.state = "recording";
	}

	stop(): void {
		this.state = "inactive";
	}
}

class FakeMediaStream {
	constructor(private readonly _tracks: MediaStreamTrack[]) {}

	getVideoTracks(): MediaStreamTrack[] {
		return this._tracks;
	}
}

afterEach(() => {
	FakeMediaRecorder.last = undefined;
	vi.unstubAllGlobals();
});

describe("DisposableMediaStreamer", () => {
	it("pauses and resumes its recorder idempotently around assistant playback", () => {
		vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
		vi.stubGlobal("MediaStream", FakeMediaStream);
		const track = { readyState: "live" } as MediaStreamTrack;
		const streamer = new DisposableMediaStreamer({
			attemptId: "attempt-1",
			canSend: () => true,
			kind: "camera",
			socket: {} as InterviewSocket,
			stream: new FakeMediaStream([track]) as unknown as MediaStream,
		});

		streamer.pause();
		streamer.resume();
		streamer.start();
		const recorder = FakeMediaRecorder.last;
		expect(recorder?.state).toBe("recording");

		streamer.pause();
		streamer.pause();
		expect(recorder?.pause).toHaveBeenCalledTimes(1);
		expect(recorder?.state).toBe("paused");

		streamer.resume();
		streamer.resume();
		expect(recorder?.resume).toHaveBeenCalledTimes(1);
		expect(recorder?.state).toBe("recording");
	});

	it("resumes every paused encoder when playback stops or fails", () => {
		const camera = { pause: vi.fn(), resume: vi.fn() };
		const screen = { pause: vi.fn(), resume: vi.fn() };

		pauseDisposableMediaStreamers(camera, screen);
		resumeDisposableMediaStreamers(camera, screen);

		expect(camera.pause).toHaveBeenCalledOnce();
		expect(screen.pause).toHaveBeenCalledOnce();
		expect(camera.resume).toHaveBeenCalledOnce();
		expect(screen.resume).toHaveBeenCalledOnce();
	});
});
