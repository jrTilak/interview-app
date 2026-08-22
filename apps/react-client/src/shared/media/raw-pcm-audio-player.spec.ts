import { describe, expect, it, vi } from "vitest";
import {
	CompletedAudioTurnPlayer,
	type DecodedAudioBufferLike,
	type DecodedAudioBufferSourceLike,
	type PlaybackAudioContextLike,
} from "./raw-pcm-audio-player.js";

class FakeAudioSource implements DecodedAudioBufferSourceLike {
	buffer: DecodedAudioBufferLike | null = null;
	onended: (() => void) | null = null;
	startCalls = 0;
	stopped = false;

	connect(): void {}

	disconnect(): void {}

	end(): void {
		this.onended?.();
	}

	start(): void {
		this.startCalls += 1;
	}

	stop(): void {
		this.stopped = true;
	}
}

class FakeAudioContext implements PlaybackAudioContextLike {
	closed = false;
	readonly decodedBuffer = {};
	readonly decodeAudioData = vi.fn(
		async (_audioData: ArrayBuffer) => this.decodedBuffer,
	);
	readonly destination = {};
	readonly sources: FakeAudioSource[] = [];
	state: AudioContextState = "suspended";

	async close(): Promise<void> {
		this.closed = true;
		this.state = "closed";
	}

	createBufferSource(): DecodedAudioBufferSourceLike {
		const source = new FakeAudioSource();
		this.sources.push(source);
		return source;
	}

	async resume(): Promise<void> {
		this.state = "running";
	}

	async suspend(): Promise<void> {
		this.state = "suspended";
	}
}

describe("CompletedAudioTurnPlayer", () => {
	it("suspends and resumes an already unlocked audio context", async () => {
		const context = new FakeAudioContext();
		const player = new CompletedAudioTurnPlayer({
			contextFactory: () => context,
		});

		await player.resume();
		expect(context.state).toBe("running");
		await player.suspend();
		expect(context.state).toBe("suspended");
		await player.resume();
		expect(context.state).toBe("running");
	});

	it("native-decodes the complete WAV once and starts one source only after turn end", async () => {
		const context = new FakeAudioContext();
		const player = new CompletedAudioTurnPlayer({
			contextFactory: () => context,
		});
		await player.resume();
		player.beginTurn("assistant-1");
		player.enqueue({
			data: new Uint8Array([0x52, 0x49]),
			mimeType: "audio/wav",
			sequence: 0,
			turnId: "assistant-1",
		});
		player.enqueue({
			data: new Uint8Array([0x46, 0x46]),
			mimeType: "audio/wav",
			sequence: 1,
			turnId: "assistant-1",
		});

		expect(context.decodeAudioData).not.toHaveBeenCalled();
		expect(context.sources).toHaveLength(0);

		let drained = false;
		const ending = player.endTurn("assistant-1").then(() => {
			drained = true;
		});
		await vi.waitFor(() => expect(context.sources).toHaveLength(1));

		expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
		expect(
			Array.from(
				new Uint8Array(
					context.decodeAudioData.mock.calls[0]?.[0] as ArrayBuffer,
				),
			),
		).toEqual([0x52, 0x49, 0x46, 0x46]);
		expect(context.sources[0]?.buffer).toBe(context.decodedBuffer);
		expect(context.sources[0]?.startCalls).toBe(1);
		expect(drained).toBe(false);

		context.sources[0]?.end();
		await ending;
		expect(drained).toBe(true);
		expect(player.activeTurnId).toBeUndefined();
	});

	it("supports subtitle-only turns and cancels decoded playback", async () => {
		const context = new FakeAudioContext();
		const player = new CompletedAudioTurnPlayer({
			contextFactory: () => context,
		});
		player.beginTurn("subtitle-only");
		await expect(player.endTurn("subtitle-only")).resolves.toBeUndefined();
		expect(context.decodeAudioData).not.toHaveBeenCalled();

		player.beginTurn("assistant-2");
		player.enqueue({
			data: new Uint8Array([1, 2, 3, 4]),
			mimeType: "audio/wav",
			sequence: 0,
			turnId: "assistant-2",
		});
		const ending = player.endTurn("assistant-2");
		await vi.waitFor(() => expect(context.sources).toHaveLength(1));
		await player.dispose();
		expect(context.sources[0]?.stopped).toBe(true);
		await ending;
		expect(context.closed).toBe(true);
		expect(() => player.beginTurn("later")).toThrow("disposed");
	});

	it("rejects non-WAV input and out-of-order file parts", () => {
		const player = new CompletedAudioTurnPlayer({
			contextFactory: () => new FakeAudioContext(),
		});
		player.beginTurn("assistant-3");
		expect(() =>
			player.enqueue({
				data: new Uint8Array([1]),
				mimeType: "audio/wav",
				sequence: 1,
				turnId: "assistant-3",
			}),
		).toThrow("Expected audio part 0");
		expect(() =>
			player.enqueue({
				data: new Uint8Array([1]),
				mimeType: "audio/l16",
				sequence: 0,
				turnId: "assistant-3",
			}),
		).toThrow("Unsupported assistant audio type");
	});
});
