import { describe, expect, it, vi } from "vitest";
import type {
	MicrophoneCaptureCompletion,
	MicrophoneFrameSourceResult,
	MicrophonePcmChunk,
	MonoMicrophoneFrameSource,
} from "./microphone-capture.js";
import {
	EmptyMicrophoneCaptureError,
	PcmMicrophoneCaptureController,
} from "./microphone-capture.js";

class FakeMicrophoneSource implements MonoMicrophoneFrameSource {
	private onFrame?: (samples: Float32Array) => void;
	stopCalls = 0;

	constructor(private readonly sampleRateHz = 8_000) {}

	emit(samples: number[]): void {
		this.onFrame?.(new Float32Array(samples));
	}

	async start(
		onFrame: (samples: Float32Array) => void,
	): Promise<MicrophoneFrameSourceResult> {
		this.onFrame = onFrame;
		return { sampleRateHz: this.sampleRateHz };
	}

	async stop(): Promise<void> {
		this.stopCalls += 1;
		this.onFrame = undefined;
	}
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
}

describe("PcmMicrophoneCaptureController", () => {
	it("emits bounded sequence-zero chunks and completes only after ordered writes", async () => {
		const source = new FakeMicrophoneSource();
		const firstWrite = deferred<void>();
		const order: string[] = [];
		const chunks: MicrophonePcmChunk[] = [];
		const completions: MicrophoneCaptureCompletion[] = [];
		const controller = new PcmMicrophoneCaptureController(
			source,
			{
				async onChunk(chunk) {
					chunks.push(chunk);
					order.push(`start:${chunk.sequence}`);
					if (chunk.sequence === 0) await firstWrite.promise;
					order.push(`end:${chunk.sequence}`);
				},
				onComplete(completion) {
					completions.push(completion);
					order.push("complete");
				},
			},
			{ maxChunkBytes: 4, maxTurnBytes: 32 },
		);
		await controller.start();
		source.emit([1, 0.5, -1]);
		const finished = controller.finish();
		await Promise.resolve();

		expect(order).toEqual(["start:0"]);
		firstWrite.resolve();
		await expect(finished).resolves.toMatchObject({
			lastSequence: 1,
			reason: "manual",
			sampleRateHz: 8_000,
			totalBytes: 6,
		});
		expect(order).toEqual(["start:0", "end:0", "start:1", "end:1", "complete"]);
		expect(chunks.map(({ sequence }) => sequence)).toEqual([0, 1]);
		expect(chunks.map(({ data }) => data.byteLength)).toEqual([4, 2]);
		expect(Array.from(chunks[0]?.data ?? [])).toEqual([0x7f, 0xff, 0x40, 0]);
		expect(completions).toHaveLength(1);
		expect(source.stopCalls).toBe(1);
		expect(controller.state).toBe("idle");
	});

	it("finishes automatically after real speech and acoustic silence", async () => {
		const source = new FakeMicrophoneSource();
		const completion = deferred<MicrophoneCaptureCompletion>();
		const controller = new PcmMicrophoneCaptureController(
			source,
			{
				onChunk: vi.fn(),
				onComplete: completion.resolve,
			},
			{
				maxChunkBytes: 160,
				maxTurnBytes: 1_024,
				vad: {
					minimumSpeechMs: 10,
					silenceDurationMs: 20,
					speechThreshold: 0.1,
				},
			},
		);
		await controller.start();
		source.emit(Array(80).fill(0.5));
		source.emit(Array(80).fill(0));
		source.emit(Array(80).fill(0));

		await expect(completion.promise).resolves.toMatchObject({
			lastSequence: 2,
			reason: "silence",
			totalBytes: 480,
		});
		expect(source.stopCalls).toBe(1);
		expect(controller.state).toBe("idle");
	});

	it("rejects an empty manual turn without emitting a completion", async () => {
		const source = new FakeMicrophoneSource();
		const onComplete = vi.fn();
		const onError = vi.fn();
		const controller = new PcmMicrophoneCaptureController(
			source,
			{ onChunk: vi.fn(), onComplete, onError },
			{ maxChunkBytes: 4, maxTurnBytes: 4 },
		);
		await controller.start();

		await expect(controller.finish()).rejects.toBeInstanceOf(
			EmptyMicrophoneCaptureError,
		);
		expect(onComplete).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it("stops and reports a turn that exceeds its configured byte bound", async () => {
		const source = new FakeMicrophoneSource();
		const failure = deferred<unknown>();
		const controller = new PcmMicrophoneCaptureController(
			source,
			{
				onChunk: vi.fn(),
				onComplete: vi.fn(),
				onError: failure.resolve,
			},
			{ maxChunkBytes: 4, maxTurnBytes: 4 },
		);
		await controller.start();
		source.emit([1, 1, 1]);

		await expect(failure.promise).resolves.toBeInstanceOf(RangeError);
		expect(source.stopCalls).toBe(1);
		expect(controller.state).toBe("idle");
	});
});
