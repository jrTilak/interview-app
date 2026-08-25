import { jest } from "@jest/globals";
import { AiHttpService } from "./ai-http.service.js";

type PostRequest = Parameters<AiHttpService["post"]>[0];

function request(overrides: Partial<PostRequest> = {}): PostRequest {
	return {
		name: "Test AI",
		url: new URL("http://127.0.0.1/provider"),
		body: "{}",
		headers: { "Content-Type": "application/json" },
		timeoutMs: 10_000,
		expectedMimeType: "application/json",
		responseType: "response type",
		maximumBytes: 1_024,
		limitMessage: "response is too large",
		...overrides,
	};
}

describe("AiHttpService", () => {
	afterEach(() => jest.restoreAllMocks());

	it("reports the signal that aborted the request first", async () => {
		let rejectRequest: ((reason?: unknown) => void) | undefined;
		let combinedSignal: AbortSignal | undefined;
		jest.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
			combinedSignal = init?.signal as AbortSignal;
			return new Promise<Response>((_resolve, reject) => {
				rejectRequest = reject;
			});
		});
		const caller = new AbortController();
		const service = new AiHttpService();

		const pending = service.post(
			request({ timeoutMs: 5, signal: caller.signal }),
		);
		await new Promise<void>((resolve) => {
			if (combinedSignal?.aborted) resolve();
			else
				combinedSignal?.addEventListener("abort", () => resolve(), {
					once: true,
				});
		});
		caller.abort();
		rejectRequest?.(new Error("delayed abort rejection"));

		await expect(pending).rejects.toThrow(
			"Test AI request timed out after 5 ms",
		);
	});

	it("cancels a response with an invalid Content-Length header", async () => {
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			cancel() {
				cancelled = true;
			},
		});
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(body, {
				headers: {
					"Content-Length": "invalid",
					"Content-Type": "application/json",
				},
			}),
		);
		const service = new AiHttpService();

		await expect(service.post(request())).rejects.toThrow(
			"Test AI returned an invalid Content-Length header",
		);
		expect(cancelled).toBe(true);
	});

	it("posts the supplied request and accepts a body at the exact size limit", async () => {
		const bytes = Uint8Array.from([1, 2, 3, 4]);
		const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(bytes, {
				headers: {
					"Content-Length": "4",
					"Content-Type": "Application/JSON; charset=utf-8",
				},
			}),
		);
		const service = new AiHttpService();

		const response = await service.post(request({ maximumBytes: 4 }));

		expect(response.bytes).toEqual(Buffer.from(bytes));
		expect(fetchSpy).toHaveBeenCalledWith(
			new URL("http://127.0.0.1/provider"),
			expect.objectContaining({
				method: "POST",
				body: "{}",
				headers: { "Content-Type": "application/json" },
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it("normalizes a bounded HTTP error detail", async () => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("  service\n  temporarily unavailable  ", {
				status: 429,
				statusText: "Too Many Requests",
			}),
		);
		const service = new AiHttpService();

		await expect(service.post(request())).rejects.toThrow(
			"Test AI request failed with HTTP 429 Too Many Requests: service temporarily unavailable",
		);
	});

	it("does not hide invalid framing on an HTTP error response", async () => {
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			cancel() {
				cancelled = true;
			},
		});
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(body, {
				status: 503,
				headers: { "Content-Length": "invalid" },
			}),
		);
		const service = new AiHttpService();

		await expect(service.post(request())).rejects.toThrow(
			"Test AI returned an invalid Content-Length header",
		);
		expect(cancelled).toBe(true);
	});

	it.each([
		["declared oversized", "1025", "response is too large"],
		[
			"unsafe Content-Length",
			String(Number.MAX_SAFE_INTEGER + 1),
			"invalid Content-Length header",
		],
	] as const)("cancels a %s response", async (_label, length, message) => {
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			cancel() {
				cancelled = true;
			},
		});
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(body, {
				headers: {
					"Content-Length": length,
					"Content-Type": "application/json",
				},
			}),
		);
		const service = new AiHttpService();

		await expect(service.post(request())).rejects.toThrow(message);
		expect(cancelled).toBe(true);
	});

	it.each(["text/plain", ""])(
		"cancels a response with unsupported MIME type %j",
		async (contentType) => {
			let cancelled = false;
			const body = new ReadableStream<Uint8Array>({
				cancel() {
					cancelled = true;
				},
			});
			jest.spyOn(globalThis, "fetch").mockResolvedValue(
				new Response(body, {
					headers: contentType ? { "Content-Type": contentType } : undefined,
				}),
			);
			const service = new AiHttpService();

			await expect(service.post(request())).rejects.toThrow(
				`unsupported response type: ${contentType || "missing"}`,
			);
			expect(cancelled).toBe(true);
		},
	);

	it.each([new Error("   "), "socket disappeared"])(
		"normalizes an unknown network failure",
		async (failure) => {
			jest.spyOn(globalThis, "fetch").mockRejectedValue(failure);
			const service = new AiHttpService();

			await expect(service.post(request())).rejects.toThrow(
				"Test AI request failed: unknown network error",
			);
		},
	);

	it("returns an empty buffer when a successful response has no body", async () => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, {
				headers: { "Content-Type": "application/json" },
			}),
		);
		const service = new AiHttpService();

		await expect(service.post(request())).resolves.toMatchObject({
			bytes: Buffer.alloc(0),
		});
	});

	it("parses JSON and reports malformed syntax with the provider name", () => {
		const service = new AiHttpService();

		expect(service.parseJson("Test AI", Buffer.from('{"ok":true}'))).toEqual({
			ok: true,
		});
		expect(() => service.parseJson("Test AI", Buffer.from("not-json"))).toThrow(
			"Test AI returned malformed JSON",
		);
	});
});
