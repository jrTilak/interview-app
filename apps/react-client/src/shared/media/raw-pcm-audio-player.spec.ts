import { describe, expect, it } from "vitest";
import type {
	PcmAudioBufferLike,
	PcmAudioBufferSourceLike,
	PcmAudioContextLike,
} from "./raw-pcm-audio-player.js";
import { RawPcmAudioQueuePlayer } from "./raw-pcm-audio-player.js";

class FakeAudioBuffer implements PcmAudioBufferLike {
	readonly channelData: Float32Array[];

	constructor(channels: number, frameCount: number) {
		this.channelData = Array.from(
			{ length: channels },
			() => new Float32Array(frameCount),
		);
	}

	getChannelData(channel: number): Float32Array {
		const data = this.channelData[channel];
		if (!data) throw new RangeError("Unknown channel");
		return data;
	}
}

class FakeAudioSource implements PcmAudioBufferSourceLike {
	buffer: PcmAudioBufferLike | null = null;
	onended: (() => void) | null = null;
	startTime?: number;
	stopped = false;

	connect(): void {}

	disconnect(): void {}

	end(): void {
		this.onended?.();
	}

	start(when?: number): void {
		this.startTime = when;
	}

	stop(): void {
		this.stopped = true;
	}
}

class FakeAudioContext implements PcmAudioContextLike {
	closed = false;
	currentTime = 10;
	readonly destination = {};
	readonly sources: FakeAudioSource[] = [];
	state: AudioContextState = "suspended";

	async close(): Promise<void> {
		this.closed = true;
		this.state = "closed";
	}

	createBuffer(channels: number, length: number): PcmAudioBufferLike {
		return new FakeAudioBuffer(channels, length);
	}

	createBufferSource(): PcmAudioBufferSourceLike {
		const source = new FakeAudioSource();
		this.sources.push(source);
		return source;
	}

	async resume(): Promise<void> {
		this.state = "running";
	}
}

describe("RawPcmAudioQueuePlayer", () => {
	it("decodes strict sequences and drains only after scheduled audio ends", async () => {
		const context = new FakeAudioContext();
		const player = new RawPcmAudioQueuePlayer({
			contextFactory: () => context,
		});
		expect(player.isRunning).toBe(false);
		await player.resume();
		expect(player.isRunning).toBe(true);
		player.beginTurn("assistant-1");
		player.enqueue({
			channels: 1,
			data: new Uint8Array([0x7f, 0xff, 0x80, 0x00]),
			mimeType: "audio/l16",
			sampleRateHz: 8_000,
			sequence: 0,
			turnId: "assistant-1",
		});
		player.enqueue({
			channels: 1,
			data: new Uint8Array([0x00, 0x00]),
			mimeType: "audio/l16; rate=8000",
			sampleRateHz: 8_000,
			sequence: 1,
			turnId: "assistant-1",
		});

		expect(context.sources).toHaveLength(2);
		expect(context.sources[0]?.startTime).toBe(10);
		expect(context.sources[1]?.startTime).toBeCloseTo(10.00025, 8);
		const firstBuffer = context.sources[0]?.buffer as FakeAudioBuffer;
		expect(Array.from(firstBuffer.channelData[0] ?? [])).toEqual([1, -1]);

		let drained = false;
		const ending = player.endTurn("assistant-1").then(() => {
			drained = true;
		});
		await Promise.resolve();
		expect(drained).toBe(false);
		context.sources[0]?.end();
		await Promise.resolve();
		expect(drained).toBe(false);
		context.sources[1]?.end();
		await ending;
		expect(drained).toBe(true);
		expect(player.activeTurnId).toBeUndefined();
	});

	it("carries a partial PCM sample across chunks with stable metadata", async () => {
		const context = new FakeAudioContext();
		const player = new RawPcmAudioQueuePlayer({
			contextFactory: () => context,
		});
		player.beginTurn("assistant-2");
		player.enqueue({
			channels: 1,
			data: new Uint8Array([0x7f]),
			mimeType: "audio/l16",
			sampleRateHz: 24_000,
			sequence: 0,
			turnId: "assistant-2",
		});
		expect(context.sources).toHaveLength(0);
		player.enqueue({
			channels: 1,
			data: new Uint8Array([0xff]),
			mimeType: "audio/l16",
			sampleRateHz: 24_000,
			sequence: 1,
			turnId: "assistant-2",
		});
		expect(context.sources).toHaveLength(1);
		const buffer = context.sources[0]?.buffer as FakeAudioBuffer;
		expect(Array.from(buffer.channelData[0] ?? [])).toEqual([1]);

		const ending = player.endTurn("assistant-2");
		context.sources[0]?.end();
		await ending;
	});

	it("rejects gaps, changed partial-frame metadata, and truncated turn ends", async () => {
		const context = new FakeAudioContext();
		const player = new RawPcmAudioQueuePlayer({
			contextFactory: () => context,
		});
		player.beginTurn("assistant-3");
		expect(() =>
			player.enqueue({
				channels: 1,
				data: new Uint8Array([0, 0]),
				mimeType: "audio/l16",
				sampleRateHz: 8_000,
				sequence: 1,
				turnId: "assistant-3",
			}),
		).toThrow("Expected PCM chunk 0");
		player.enqueue({
			channels: 1,
			data: new Uint8Array([0x7f]),
			mimeType: "audio/l16",
			sampleRateHz: 8_000,
			sequence: 0,
			turnId: "assistant-3",
		});
		expect(() =>
			player.enqueue({
				channels: 1,
				data: new Uint8Array([0xff]),
				mimeType: "audio/l16",
				sampleRateHz: 16_000,
				sequence: 1,
				turnId: "assistant-3",
			}),
		).toThrow("metadata changed");
		await expect(player.endTurn("assistant-3")).rejects.toThrow(
			"partial PCM frame",
		);
		player.stop();
	});

	it("supports subtitle-only turns and stops pending sources on disposal", async () => {
		const context = new FakeAudioContext();
		const player = new RawPcmAudioQueuePlayer({
			contextFactory: () => context,
		});
		player.beginTurn("subtitle-only");
		await expect(player.endTurn("subtitle-only")).resolves.toBeUndefined();

		player.beginTurn("assistant-4");
		player.enqueue({
			channels: 1,
			data: new Uint8Array([0, 0]),
			mimeType: "audio/l16",
			sampleRateHz: 8_000,
			sequence: 0,
			turnId: "assistant-4",
		});
		await player.dispose();
		expect(context.sources[0]?.stopped).toBe(true);
		expect(context.closed).toBe(true);
		expect(player.isRunning).toBe(false);
		expect(() => player.beginTurn("later")).toThrow("disposed");
	});
});
