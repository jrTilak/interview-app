import { jest } from "@jest/globals";
import type { AppConfigService } from "#/types/index.js";
import { LocalSpeechToTextAdapter } from "./local-stt.adapter.js";

function config(overrides: Record<string, unknown> = {}): AppConfigService {
	const values: Record<string, unknown> = {
		AUDIO_MAX_BYTES: 10 * 1024 * 1024,
		LOCAL_STT_TIMEOUT_MS: 10_000,
		LOCAL_STT_URL: "http://127.0.0.1:8002",
		...overrides,
	};
	return {
		get: (key: string) => values[key],
	} as unknown as AppConfigService;
}

function transcriptResponse(
	value: unknown = { text: "Candidate answer" },
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(value), {
		headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
	});
}

describe("LocalSpeechToTextAdapter", () => {
	afterEach(() => jest.restoreAllMocks());

	it("uploads the current client PCM format with its required metadata", async () => {
		const pcm = Uint8Array.from([0, 0, 1, 0]);
		const fetchSpy = jest
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(transcriptResponse({ text: "  Candidate answer  " }));
		const adapter = new LocalSpeechToTextAdapter(config());

		const text = await adapter.transcribe({
			bytes: pcm,
			channels: 1,
			mimeType: "Audio/L16; rate=16000",
			sampleRateHz: 16_000,
		});

		expect(text).toBe("Candidate answer");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
			"http://127.0.0.1:8002/transcribe",
		);
		const request = fetchSpy.mock.calls[0]?.[1];
		expect(request).toEqual(
			expect.objectContaining({
				headers: { Accept: "application/json" },
				method: "POST",
			}),
		);
		const form = request?.body as FormData;
		expect(form).toBeInstanceOf(FormData);
		expect(form.get("sample_rate_hz")).toBe("16000");
		expect(form.get("channels")).toBe("1");
		const audio = form.get("audio") as Blob;
		expect(audio).toBeInstanceOf(Blob);
		expect(audio.type).toBe("audio/l16");
		expect(new Uint8Array(await audio.arrayBuffer())).toEqual(pcm);
	});

	it("uploads WAV without raw PCM form fields and honors the URL override", async () => {
		const fetchSpy = jest
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(transcriptResponse());
		const adapter = new LocalSpeechToTextAdapter(
			config({ LOCAL_STT_URL: "http://stt.internal:9000/base/" }),
		);

		await adapter.transcribe({
			bytes: Uint8Array.from([82, 73, 70, 70]),
			mimeType: "audio/x-wav",
		});

		expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
			"http://stt.internal:9000/transcribe",
		);
		const form = fetchSpy.mock.calls[0]?.[1]?.body as FormData;
		expect((form.get("audio") as Blob).type).toBe("audio/x-wav");
		expect(form.has("sample_rate_hz")).toBe(false);
		expect(form.has("channels")).toBe(false);
	});

	it.each([
		[
			"unsupported MIME type",
			{ bytes: Uint8Array.from([0, 0]), mimeType: "audio/ogg" },
			"Unsupported local transcription audio type",
		],
		[
			"empty audio",
			{ bytes: new Uint8Array(), mimeType: "audio/wav" },
			"must not be empty",
		],
		[
			"missing PCM rate",
			{ bytes: Uint8Array.from([0, 0]), mimeType: "audio/l16" },
			"requires a sample rate",
		],
		[
			"out-of-range PCM rate",
			{
				bytes: Uint8Array.from([0, 0]),
				channels: 1,
				mimeType: "audio/l16",
				sampleRateHz: 192_001,
			},
			"requires a sample rate",
		],
		[
			"invalid channels",
			{
				bytes: Uint8Array.from([0, 0]),
				channels: 3,
				mimeType: "audio/l16",
				sampleRateHz: 16_000,
			},
			"requires one or two channels",
		],
		[
			"missing channels",
			{
				bytes: Uint8Array.from([0, 0]),
				mimeType: "audio/l16",
				sampleRateHz: 16_000,
			},
			"requires one or two channels",
		],
		[
			"partial PCM frame",
			{
				bytes: Uint8Array.from([0, 0, 1]),
				channels: 1,
				mimeType: "audio/l16",
				sampleRateHz: 16_000,
			},
			"complete 16-bit audio frames",
		],
	] as const)(
		"rejects %s before making a request",
		async (_label, input, message) => {
			const fetchSpy = jest.spyOn(globalThis, "fetch");
			const adapter = new LocalSpeechToTextAdapter(config());

			await expect(adapter.transcribe(input)).rejects.toThrow(message);
			expect(fetchSpy).not.toHaveBeenCalled();
		},
	);

	it("enforces the configured request byte limit", async () => {
		const fetchSpy = jest.spyOn(globalThis, "fetch");
		const adapter = new LocalSpeechToTextAdapter(
			config({ AUDIO_MAX_BYTES: 2 }),
		);

		await expect(
			adapter.transcribe({
				bytes: Uint8Array.from([1, 2, 3]),
				mimeType: "audio/wav",
			}),
		).rejects.toThrow("exceeds the 2-byte request limit");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("surfaces bounded HTTP errors without falling back", async () => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(`service unavailable ${"x".repeat(8_000)}`, {
				status: 503,
				statusText: "Service Unavailable",
			}),
		);
		const adapter = new LocalSpeechToTextAdapter(config());

		await expect(
			adapter.transcribe({
				bytes: Uint8Array.from([0, 0]),
				mimeType: "audio/wav",
			}),
		).rejects.toThrow(
			"Local STT request failed with HTTP 503 Service Unavailable: response detail omitted because it was too large",
		);
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
		const adapter = new LocalSpeechToTextAdapter(config());

		const pending = adapter.transcribe({
			bytes: Uint8Array.from([0, 0]),
			mimeType: "audio/wav",
			signal: controller.signal,
		});
		controller.abort();

		await expect(pending).rejects.toThrow("Local STT request was cancelled");
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
		const adapter = new LocalSpeechToTextAdapter(
			config({ LOCAL_STT_TIMEOUT_MS: 5 }),
		);

		await expect(
			adapter.transcribe({
				bytes: Uint8Array.from([0, 0]),
				mimeType: "audio/wav",
			}),
		).rejects.toThrow("Local STT request timed out after 5 ms");
	});

	it.each([
		[
			"wrong response type",
			new Response('{"text":"answer"}', {
				headers: { "Content-Type": "text/plain" },
			}),
			"unsupported response type: text/plain",
		],
		[
			"malformed JSON",
			new Response("not-json", {
				headers: { "Content-Type": "application/json" },
			}),
			"malformed JSON",
		],
		[
			"non-string transcript",
			transcriptResponse({ text: 42 }),
			"invalid transcript payload",
		],
	] as const)("rejects %s", async (_label, response, message) => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(response);
		const adapter = new LocalSpeechToTextAdapter(config());

		await expect(
			adapter.transcribe({
				bytes: Uint8Array.from([0, 0]),
				mimeType: "audio/wav",
			}),
		).rejects.toThrow(message);
	});

	it("cancels a transcript response that exceeds 128 KiB", async () => {
		const chunk = new Uint8Array(64 * 1024);
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>({
			cancel() {
				cancelled = true;
			},
			pull(controller) {
				controller.enqueue(chunk);
			},
		});
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(stream, {
				headers: { "Content-Type": "application/json" },
			}),
		);
		const adapter = new LocalSpeechToTextAdapter(config());

		await expect(
			adapter.transcribe({
				bytes: Uint8Array.from([0, 0]),
				mimeType: "audio/wav",
			}),
		).rejects.toThrow("exceeds the 131072-byte response limit");
		expect(cancelled).toBe(true);
	});
});
