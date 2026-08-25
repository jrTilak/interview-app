import { jest } from "@jest/globals";
import { AiHttpService } from "./ai-http.service.js";

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

		const pending = service.post({
			name: "Test AI",
			url: new URL("http://127.0.0.1/provider"),
			body: "{}",
			headers: { "Content-Type": "application/json" },
			timeoutMs: 5,
			signal: caller.signal,
			expectedMimeType: "application/json",
			responseType: "response type",
			maximumBytes: 1_024,
			limitMessage: "response is too large",
		});
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

		await expect(
			service.post({
				name: "Test AI",
				url: new URL("http://127.0.0.1/provider"),
				body: "{}",
				headers: { "Content-Type": "application/json" },
				timeoutMs: 10_000,
				expectedMimeType: "application/json",
				responseType: "response type",
				maximumBytes: 1_024,
				limitMessage: "response is too large",
			}),
		).rejects.toThrow("Test AI returned an invalid Content-Length header");
		expect(cancelled).toBe(true);
	});
});
