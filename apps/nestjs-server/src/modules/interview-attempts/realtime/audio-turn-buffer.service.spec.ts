import { jest } from "@jest/globals";
import {
	BadRequestException,
	ConflictException,
	PayloadTooLargeException,
} from "@nestjs/common";
import type { AppConfigService } from "#/types/index.js";
import {
	AUDIO_MAX_CHUNKS_PER_TURN,
	AudioTurnBufferService,
} from "./audio-turn-buffer.service.js";

const metadata = {
	attemptId: "f0c765b0-a9fe-4a67-bf75-a63486949831",
	turnId: "19ad8c03-9e89-4d23-b393-d3cd6a654900",
	mimeType: "audio/wav",
	channels: 1,
};

/** Creates the bounded config used by the isolated buffer tests. */
function createConfig(
	overrides: Record<string, number> = {},
): AppConfigService {
	const values: Record<string, number> = {
		AUDIO_SILENCE_MS: 1000,
		AUDIO_MAX_BYTES: 8,
		...overrides,
	};
	return {
		get: (key: string) => values[key],
	} as unknown as AppConfigService;
}

describe("AudioTurnBufferService", () => {
	afterEach(() => jest.useRealTimers());

	it("combines strictly ordered chunks and closes exactly once", () => {
		const service = new AudioTurnBufferService(createConfig());
		service.start("socket", metadata, jest.fn());
		service.append("socket", { ...metadata, sequence: 0 }, Buffer.from("ab"));
		service.append("socket", { ...metadata, sequence: 1 }, Buffer.from("cd"));

		const result = service.finish("socket", { ...metadata, lastSequence: 1 });
		expect(Buffer.from(result.bytes).toString()).toBe("abcd");
		expect(() => service.finish("socket")).toThrow(ConflictException);
	});

	it("rejects missing, duplicate, and out-of-order chunks", () => {
		const service = new AudioTurnBufferService(createConfig());
		expect(() =>
			service.append("socket", { ...metadata, sequence: 0 }, Buffer.from("a")),
		).toThrow(ConflictException);

		service.start("socket", metadata, jest.fn());
		expect(() =>
			service.append("socket", { ...metadata, sequence: 1 }, Buffer.from("a")),
		).toThrow(ConflictException);
		service.append("socket", { ...metadata, sequence: 0 }, Buffer.from("a"));
		expect(() =>
			service.append("socket", { ...metadata, sequence: 0 }, Buffer.from("a")),
		).toThrow(ConflictException);
	});

	it("rejects empty chunks without consuming their sequence", () => {
		const service = new AudioTurnBufferService(createConfig());
		service.start("socket", metadata, jest.fn());

		expect(() =>
			service.append("socket", { ...metadata, sequence: 0 }, Buffer.alloc(0)),
		).toThrow(BadRequestException);
		service.append("socket", { ...metadata, sequence: 0 }, Buffer.from("a"));

		expect(
			Buffer.from(
				service.finish("socket", { ...metadata, lastSequence: 0 }).bytes,
			).toString(),
		).toBe("a");
	});

	it("drops a turn immediately when the byte limit is exceeded", () => {
		const service = new AudioTurnBufferService(createConfig());
		service.start("socket", metadata, jest.fn());

		expect(() =>
			service.append("socket", { ...metadata, sequence: 0 }, Buffer.alloc(9)),
		).toThrow(PayloadTooLargeException);
		expect(() => service.finish("socket")).toThrow(ConflictException);
	});

	it("rejects empty turns and mismatched final sequences", () => {
		const service = new AudioTurnBufferService(createConfig());
		service.start("socket", metadata, jest.fn());
		expect(() => service.finish("socket")).toThrow(BadRequestException);

		service.start("socket", metadata, jest.fn());
		service.append("socket", { ...metadata, sequence: 0 }, Buffer.from("a"));
		expect(() =>
			service.finish("socket", { ...metadata, lastSequence: 2 }),
		).toThrow(ConflictException);
	});

	it("invokes the silence fallback after the last received chunk", () => {
		jest.useFakeTimers();
		const onSilence = jest.fn();
		const service = new AudioTurnBufferService(createConfig());
		service.start("socket", metadata, onSilence);
		service.append("socket", { ...metadata, sequence: 0 }, Buffer.from("a"));

		jest.advanceTimersByTime(999);
		expect(onSilence).not.toHaveBeenCalled();
		jest.advanceTimersByTime(1);
		expect(onSilence).toHaveBeenCalledTimes(1);
		service.clear("socket");
	});

	it("arms the inactivity fallback even before the first chunk", () => {
		jest.useFakeTimers();
		const onSilence = jest.fn();
		const service = new AudioTurnBufferService(createConfig());
		service.start("socket", metadata, onSilence);

		jest.advanceTimersByTime(1_000);
		expect(onSilence).toHaveBeenCalledTimes(1);
		service.clear("socket");
	});

	it("enforces a global ceiling across simultaneous socket buffers", () => {
		jest.useFakeTimers();
		const service = new AudioTurnBufferService(createConfig());
		for (let index = 0; index < 5; index += 1) {
			const socketId = `socket-${index}`;
			service.start(socketId, metadata, jest.fn());
			service.append(socketId, { ...metadata, sequence: 0 }, Buffer.alloc(8));
		}
		service.start("socket-overflow", metadata, jest.fn());

		expect(() =>
			service.append(
				"socket-overflow",
				{ ...metadata, sequence: 0 },
				Buffer.from("x"),
			),
		).toThrow(PayloadTooLargeException);
		for (let index = 0; index < 5; index += 1) {
			service.clear(`socket-${index}`);
		}
	});

	it("drops a turn that exceeds the fixed chunk-count ceiling", () => {
		jest.useFakeTimers();
		const service = new AudioTurnBufferService(
			createConfig({ AUDIO_MAX_BYTES: AUDIO_MAX_CHUNKS_PER_TURN + 1 }),
		);
		service.start("socket", metadata, jest.fn());
		for (
			let sequence = 0;
			sequence < AUDIO_MAX_CHUNKS_PER_TURN;
			sequence += 1
		) {
			service.append("socket", { ...metadata, sequence }, Buffer.from("a"));
		}

		expect(() =>
			service.append(
				"socket",
				{ ...metadata, sequence: AUDIO_MAX_CHUNKS_PER_TURN },
				Buffer.from("a"),
			),
		).toThrow(PayloadTooLargeException);
		expect(() => service.finish("socket")).toThrow(ConflictException);
	});
});
