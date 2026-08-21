import { jest } from "@jest/globals";
import type { AppConfigService } from "../../../types/index.js";
import { selectTextToSpeechProvider } from "../ai.module.js";
import type { TextToSpeechPort } from "../ai.ports.js";
import type { GeminiTextToSpeechAdapter } from "../gemini/gemini-tts.adapter.js";
import { LocalTextToSpeechAdapter } from "./local-tts.adapter.js";

type WaveOptions = {
	audioFormat?: number;
	bitsPerSample?: number;
	channels?: number;
	data?: Uint8Array;
	includeJunkChunk?: boolean;
	sampleRateHz?: number;
};

function config(overrides: Record<string, unknown> = {}): AppConfigService {
	const values: Record<string, unknown> = {
		LOCAL_TTS_TIMEOUT_MS: 10_000,
		LOCAL_TTS_URL: "http://127.0.0.1:8001",
		LOCAL_TTS_VOICE: "professional-default",
		TTS_PROVIDER: "gemini",
		...overrides,
	};
	return {
		get: (key: string) => values[key],
	} as unknown as AppConfigService;
}

function chunk(id: string, content: Uint8Array): Buffer {
	const result = Buffer.alloc(
		8 + content.byteLength + (content.byteLength % 2),
	);
	result.write(id, 0, "ascii");
	result.writeUInt32LE(content.byteLength, 4);
	Buffer.from(content).copy(result, 8);
	return result;
}

function wave(options: WaveOptions = {}): Buffer {
	const audioFormat = options.audioFormat ?? 1;
	const bitsPerSample = options.bitsPerSample ?? 16;
	const channels = options.channels ?? 1;
	const sampleRateHz = options.sampleRateHz ?? 24_000;
	const blockAlign = (channels * bitsPerSample) / 8;
	const format = Buffer.alloc(16);
	format.writeUInt16LE(audioFormat, 0);
	format.writeUInt16LE(channels, 2);
	format.writeUInt32LE(sampleRateHz, 4);
	format.writeUInt32LE(sampleRateHz * blockAlign, 8);
	format.writeUInt16LE(blockAlign, 12);
	format.writeUInt16LE(bitsPerSample, 14);
	const chunks = [
		...(options.includeJunkChunk
			? [chunk("JUNK", Uint8Array.from([1, 2, 3]))]
			: []),
		chunk("fmt ", format),
		chunk("data", options.data ?? Uint8Array.from([0, 0, 1, 0])),
	];
	const result = Buffer.concat([Buffer.alloc(12), ...chunks]);
	result.write("RIFF", 0, "ascii");
	result.writeUInt32LE(result.byteLength - 8, 4);
	result.write("WAVE", 8, "ascii");
	return result;
}

function audioResponse(
	bytes: Uint8Array = wave(),
	headers: Record<string, string> = {},
): Response {
	return new Response(new Uint8Array(bytes), {
		headers: { "Content-Type": "audio/wav; codec=pcm", ...headers },
	});
}

describe("LocalTextToSpeechAdapter", () => {
	afterEach(() => jest.restoreAllMocks());

	it("posts the exact text and default or caller-selected voice", async () => {
		const firstWave = wave({ includeJunkChunk: true });
		const secondWave = wave();
		const fetchSpy = jest
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(audioResponse(firstWave))
			.mockResolvedValueOnce(audioResponse(secondWave));
		const adapter = new LocalTextToSpeechAdapter(config());

		const first = await adapter.synthesize({ text: "Speak this exactly." });
		await adapter.synthesize({ text: "Another turn", voice: "warm-female" });

		expect(first).toEqual({
			bytes: firstWave,
			channels: 1,
			mimeType: "audio/wav",
			sampleRateHz: 24_000,
		});
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
			"http://127.0.0.1:8001/synthesize",
		);
		expect(fetchSpy.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				body: JSON.stringify({
					text: "Speak this exactly.",
					voice: "professional-default",
				}),
				method: "POST",
			}),
		);
		expect(fetchSpy.mock.calls[1]?.[1]?.body).toBe(
			JSON.stringify({ text: "Another turn", voice: "warm-female" }),
		);
	});

	it("uses URL and voice configuration overrides", async () => {
		const fetchSpy = jest
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(audioResponse());
		const adapter = new LocalTextToSpeechAdapter(
			config({
				LOCAL_TTS_URL: "http://tts.internal:9000/base/",
				LOCAL_TTS_VOICE: "configured-voice",
			}),
		);

		await adapter.synthesize({ text: "Hello" });

		expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
			"http://tts.internal:9000/synthesize",
		);
		expect(fetchSpy.mock.calls[0]?.[1]?.body).toBe(
			JSON.stringify({ text: "Hello", voice: "configured-voice" }),
		);
	});

	it("surfaces bounded HTTP failure details without another request", async () => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(`service unavailable ${"x".repeat(8_000)}`, {
				status: 503,
				statusText: "Service Unavailable",
			}),
		);
		const adapter = new LocalTextToSpeechAdapter(config());

		const error = await adapter
			.synthesize({ text: "Hello" })
			.catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toMatch(
			/^Local TTS request failed with HTTP 503 Service Unavailable: service unavailable/,
		);
		expect((error as Error).message.length).toBeLessThan(4_300);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it("combines caller cancellation with the configured timeout signal", async () => {
		let requestSignal: AbortSignal | undefined;
		jest.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
			requestSignal = init?.signal as AbortSignal;
			return new Promise<Response>((_resolve, reject) => {
				requestSignal?.addEventListener(
					"abort",
					() => reject(requestSignal?.reason),
					{ once: true },
				);
			});
		});
		const controller = new AbortController();
		const adapter = new LocalTextToSpeechAdapter(config());

		const pending = adapter.synthesize({
			signal: controller.signal,
			text: "Hello",
		});
		controller.abort();

		await expect(pending).rejects.toThrow("Local TTS request was cancelled");
		expect(requestSignal).not.toBe(controller.signal);
		expect(requestSignal?.aborted).toBe(true);
	});

	it("reports the configured request timeout", async () => {
		jest.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
			const signal = init?.signal as AbortSignal;
			return new Promise<Response>((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(signal.reason), {
					once: true,
				});
			});
		});
		const adapter = new LocalTextToSpeechAdapter(
			config({ LOCAL_TTS_TIMEOUT_MS: 5 }),
		);

		await expect(adapter.synthesize({ text: "Hello" })).rejects.toThrow(
			"Local TTS request timed out after 5 ms",
		);
	});

	it("rejects a successful response with the wrong MIME type", async () => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(new Uint8Array(wave()), {
				headers: { "Content-Type": "application/octet-stream" },
			}),
		);
		const adapter = new LocalTextToSpeechAdapter(config());

		await expect(adapter.synthesize({ text: "Hello" })).rejects.toThrow(
			"unsupported audio type: application/octet-stream",
		);
	});

	it.each([
		["empty", new Uint8Array()],
		["malformed", Buffer.from("not a wave")],
		["incomplete", Buffer.from("RIFF\u0004\u0000\u0000\u0000WAVE", "binary")],
	])("rejects %s WAV output", async (_label, bytes) => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(audioResponse(bytes));
		const adapter = new LocalTextToSpeechAdapter(config());

		await expect(adapter.synthesize({ text: "Hello" })).rejects.toThrow(
			/empty|malformed|incomplete/,
		);
	});

	it.each([
		["IEEE float encoding", { audioFormat: 3 }],
		["stereo channels", { channels: 2 }],
		["22050 Hz samples", { sampleRateHz: 22_050 }],
		["8-bit samples", { bitsPerSample: 8 }],
	] satisfies [string, WaveOptions][])(
		"rejects WAV with %s",
		async (_label, options) => {
			jest
				.spyOn(globalThis, "fetch")
				.mockResolvedValue(audioResponse(wave(options)));
			const adapter = new LocalTextToSpeechAdapter(config());

			await expect(adapter.synthesize({ text: "Hello" })).rejects.toThrow(
				/PCM encoding|mono 24000 Hz 16-bit PCM/,
			);
		},
	);

	it("rejects truncated chunks and empty sample data", async () => {
		const truncated = wave();
		truncated.writeUInt32LE(100, truncated.byteLength - 8);
		const empty = wave({ data: new Uint8Array() });
		const fetchSpy = jest
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(audioResponse(truncated))
			.mockResolvedValueOnce(audioResponse(empty));
		const adapter = new LocalTextToSpeechAdapter(config());

		await expect(adapter.synthesize({ text: "Hello" })).rejects.toThrow(
			"truncated WAV chunk",
		);
		await expect(adapter.synthesize({ text: "Hello" })).rejects.toThrow(
			"complete, non-empty audio frames",
		);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("cancels a streaming response that exceeds 20 MiB", async () => {
		const fiveMiB = new Uint8Array(5 * 1024 * 1024);
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>({
			cancel() {
				cancelled = true;
			},
			pull(controller) {
				controller.enqueue(fiveMiB);
			},
		});
		jest
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(
				new Response(stream, { headers: { "Content-Type": "audio/wav" } }),
			);
		const adapter = new LocalTextToSpeechAdapter(config());

		await expect(adapter.synthesize({ text: "Hello" })).rejects.toThrow(
			"exceeds the 20971520-byte response limit",
		);
		expect(cancelled).toBe(true);
	});

	it.each([
		["X-Sample-Rate", "16000"],
		["X-Channels", "2"],
		["X-Bit-Depth", "8"],
	])("rejects conflicting %s response metadata", async (name, value) => {
		jest
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(audioResponse(wave(), { [name]: value }));
		const adapter = new LocalTextToSpeechAdapter(config());

		await expect(adapter.synthesize({ text: "Hello" })).rejects.toThrow(
			`${name} header conflicts with WAV metadata`,
		);
	});
});

describe("TTS provider selection", () => {
	const gemini = {
		synthesize: jest.fn(),
	} as unknown as GeminiTextToSpeechAdapter;
	const local = {
		synthesize: jest.fn(),
	} as unknown as LocalTextToSpeechAdapter;

	it.each([
		["gemini", gemini],
		["local", local],
	] as const)(
		"selects only the configured %s adapter",
		(provider, expected) => {
			const selected: TextToSpeechPort = selectTextToSpeechProvider(
				config({ TTS_PROVIDER: provider }),
				gemini,
				local,
			);

			expect(selected).toBe(expected);
		},
	);
});
