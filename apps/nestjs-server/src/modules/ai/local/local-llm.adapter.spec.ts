import { jest } from "@jest/globals";
import type { AppConfigService } from "../../../types/index.js";
import { selectInterviewLlmProvider } from "../ai.module.js";
import type {
	GenerateInterviewTurnInput,
	InterviewLlmPort,
} from "../ai.ports.js";
import type { GeminiLlmAdapter } from "../gemini/gemini-llm.adapter.js";
import { LocalLlmAdapter } from "./local-llm.adapter.js";

const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";
const otherQuestionId = "83e0c06d-cbbf-47db-80fe-9da1bc4d37b0";

function config(overrides: Record<string, unknown> = {}): AppConfigService {
	const values: Record<string, unknown> = {
		LLM_PROVIDER: "gemini",
		LOCAL_LLM_TIMEOUT_MS: 10_000,
		LOCAL_LLM_URL: "http://127.0.0.1:8003",
		...overrides,
	};
	return {
		get: (key: string) => values[key],
	} as unknown as AppConfigService;
}

function jsonResponse(
	value: unknown,
	options: { headers?: Record<string, string>; status?: number } = {},
): Response {
	return new Response(JSON.stringify(value), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			...options.headers,
		},
		status: options.status,
	});
}

function turnInput(
	overrides: Partial<GenerateInterviewTurnInput> = {},
): GenerateInterviewTurnInput {
	return {
		interview: { title: "Frontend interview", description: null },
		candidate: { name: "Ada Candidate" },
		tasks: [
			{
				id: questionId,
				position: 1,
				title: "Hooks",
				prompt: "Explain useEffect.",
				objective: "Understand effect timing.",
				followUpGuidance: null,
				completed: false,
			},
		],
		transcript: [
			{ role: "assistant", text: "Tell me about hooks." },
			{ role: "candidate", text: "They let functions use state." },
		],
		remainingSeconds: 900,
		mustEnd: false,
		...overrides,
	};
}

describe("LocalLlmAdapter", () => {
	afterEach(() => jest.restoreAllMocks());

	it("maps creator notes exactly and returns only provider-neutral task fields", async () => {
		const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				tasks: [
					{
						id: null,
						title: "  Hooks  ",
						prompt: " Explain useEffect. ",
						objective: null,
						followUpGuidance: " Ask about cleanup. ",
						completed: false,
					},
				],
			}),
		);
		const adapter = new LocalLlmAdapter(config());

		const result = await adapter.structureQuestions({
			interviewTitle: "Frontend interview",
			interviewDescription: null,
			rawQuestions: "Ask about React hooks.",
		});

		expect(result).toEqual([
			{
				title: "Hooks",
				prompt: "Explain useEffect.",
				objective: null,
				followUpGuidance: "Ask about cleanup.",
			},
		]);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
			"http://127.0.0.1:8003/questions/structure",
		);
		expect(fetchSpy.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				body: JSON.stringify({
					title: "Frontend interview",
					description: null,
					notes: "Ask about React hooks.",
				}),
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				method: "POST",
			}),
		);
	});

	it("maps the complete turn context without leaking internal task positions", async () => {
		const input = turnInput();
		const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				text: "  Please explain dependency arrays.  ",
				actions: [{ type: "complete_questions", questionIds: [questionId] }],
			}),
		);
		const adapter = new LocalLlmAdapter(config());

		const result = await adapter.generateTurn(input);

		expect(result).toEqual({
			text: "Please explain dependency arrays.",
			actions: [{ type: "complete_questions", questionIds: [questionId] }],
		});
		expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
			"http://127.0.0.1:8003/interview/turn",
		);
		expect(JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string)).toEqual({
			title: input.interview.title,
			description: input.interview.description,
			candidateName: input.candidate.name,
			tasks: [
				{
					id: questionId,
					title: "Hooks",
					prompt: "Explain useEffect.",
					objective: "Understand effect timing.",
					followUpGuidance: null,
					completed: false,
				},
			],
			transcript: JSON.stringify(input.transcript),
			remainingTime: 900,
			mustEnd: false,
		});
	});

	it("uses an empty first-turn transcript and honors the service URL override", async () => {
		const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				text: "Hello Ada. Explain useEffect.",
				actions: [{ type: "complete_questions", questionIds: [questionId] }],
			}),
		);
		const adapter = new LocalLlmAdapter(
			config({ LOCAL_LLM_URL: "http://llm.internal:9000/base/" }),
		);

		await adapter.generateTurn(turnInput({ transcript: [] }));

		expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
			"http://llm.internal:9000/interview/turn",
		);
		expect(
			JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string).transcript,
		).toBe("");
	});

	it("keeps the most recent complete transcript entries within 20,000 characters", async () => {
		const fetchSpy = jest
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(jsonResponse({ text: "Next question.", actions: [] }));
		const adapter = new LocalLlmAdapter(config());
		const transcript = [
			{ role: "assistant" as const, text: `old-${"a".repeat(8_000)}` },
			{ role: "candidate" as const, text: `middle-${"b".repeat(8_000)}` },
			{ role: "assistant" as const, text: `latest-${"c".repeat(8_000)}` },
		];

		await adapter.generateTurn(turnInput({ transcript }));

		const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
		const sentTranscript = body.transcript as string;
		expect(sentTranscript.length).toBeLessThanOrEqual(20_000);
		expect(JSON.parse(sentTranscript)).toEqual(transcript.slice(-2));
	});

	it("rejects actions for task IDs outside the server-supplied context", async () => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				text: "Let us continue.",
				actions: [
					{
						type: "complete_questions",
						questionIds: [otherQuestionId],
					},
				],
			}),
		);
		const adapter = new LocalLlmAdapter(config());

		await expect(adapter.generateTurn(turnInput())).rejects.toThrow(
			"action for an unknown interview task",
		);
	});

	it("accepts a deterministic end action when no interview task remains", async () => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				text: "Thank you. That concludes the interview.",
				actions: [{ type: "end_interview", reason: "All tasks are complete." }],
			}),
		);
		const adapter = new LocalLlmAdapter(config());

		await expect(
			adapter.generateTurn(
				turnInput({
					tasks: [],
					remainingSeconds: 0,
					mustEnd: true,
				}),
			),
		).resolves.toEqual({
			text: "Thank you. That concludes the interview.",
			actions: [{ type: "end_interview", reason: "All tasks are complete." }],
		});
	});

	it("surfaces bounded HTTP errors without issuing a fallback request", async () => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(`service unavailable ${"x".repeat(8_000)}`, {
				status: 503,
				statusText: "Service Unavailable",
			}),
		);
		const adapter = new LocalLlmAdapter(config());

		await expect(
			adapter.structureQuestions({
				interviewTitle: "Frontend",
				interviewDescription: null,
				rawQuestions: "Ask about hooks.",
			}),
		).rejects.toThrow(
			"Local LLM request failed with HTTP 503 Service Unavailable: response detail omitted because it was too large",
		);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it("wraps a network failure without retrying another provider", async () => {
		jest
			.spyOn(globalThis, "fetch")
			.mockRejectedValue(new Error("connection refused"));
		const adapter = new LocalLlmAdapter(config());

		await expect(adapter.generateTurn(turnInput())).rejects.toThrow(
			"Local LLM request failed: connection refused",
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
		const adapter = new LocalLlmAdapter(config());

		const pending = adapter.generateTurn(
			turnInput({ signal: controller.signal }),
		);
		controller.abort();

		await expect(pending).rejects.toThrow("Local LLM request was cancelled");
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
		const adapter = new LocalLlmAdapter(config({ LOCAL_LLM_TIMEOUT_MS: 5 }));

		await expect(adapter.generateTurn(turnInput())).rejects.toThrow(
			"Local LLM request timed out after 5 ms",
		);
	});

	it.each([
		[
			"wrong response type",
			new Response('{"text":"Hello","actions":[]}', {
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
			"oversized interviewer text",
			jsonResponse({ text: "x".repeat(4_001), actions: [] }),
			"invalid interview-turn payload",
		],
		[
			"loosely typed action",
			jsonResponse({
				text: "Hello",
				actions: [{ type: "end_interview", reason: 42 }],
			}),
			"invalid interview-turn payload",
		],
		[
			"extra response field",
			jsonResponse({ text: "Hello", actions: [], debug: true }),
			"invalid interview-turn payload",
		],
	] as const)("rejects %s", async (_label, response, message) => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(response);
		const adapter = new LocalLlmAdapter(config());

		await expect(adapter.generateTurn(turnInput())).rejects.toThrow(message);
	});

	it("rejects invalid structured tasks instead of partially accepting them", async () => {
		jest.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				tasks: [
					{
						id: null,
						title: "Hooks",
						prompt: "Explain hooks.",
						objective: null,
						followUpGuidance: null,
						completed: false,
						unexpected: true,
					},
				],
			}),
		);
		const adapter = new LocalLlmAdapter(config());

		await expect(
			adapter.structureQuestions({
				interviewTitle: "Frontend",
				interviewDescription: null,
				rawQuestions: "Ask about hooks.",
			}),
		).rejects.toThrow("invalid structured-question payload");
	});

	it("rejects invalid Content-Length headers", async () => {
		jest
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(
				jsonResponse(
					{ text: "Hello", actions: [] },
					{ headers: { "Content-Length": "not-a-number" } },
				),
			);
		const adapter = new LocalLlmAdapter(config());

		await expect(adapter.generateTurn(turnInput())).rejects.toThrow(
			"invalid Content-Length header",
		);
	});

	it("cancels a response that exceeds 512 KiB", async () => {
		const chunk = new Uint8Array(256 * 1024);
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
		const adapter = new LocalLlmAdapter(config());

		await expect(adapter.generateTurn(turnInput())).rejects.toThrow(
			"exceeds the 524288-byte limit",
		);
		expect(cancelled).toBe(true);
	});

	it("rejects an oversized request before contacting the service", async () => {
		const fetchSpy = jest.spyOn(globalThis, "fetch");
		const adapter = new LocalLlmAdapter(config());

		await expect(
			adapter.structureQuestions({
				interviewTitle: "Frontend",
				interviewDescription: null,
				rawQuestions: "x".repeat(600 * 1024),
			}),
		).rejects.toThrow("exceeds the 524288-byte limit");
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe("LLM provider selection", () => {
	const gemini = {
		generateTurn: jest.fn(),
		structureQuestions: jest.fn(),
	} as unknown as GeminiLlmAdapter;
	const local = {
		generateTurn: jest.fn(),
		structureQuestions: jest.fn(),
	} as unknown as LocalLlmAdapter;

	it.each([
		["gemini", gemini],
		["local", local],
	] as const)(
		"selects only the configured %s adapter",
		(provider, expected) => {
			const selected: InterviewLlmPort = selectInterviewLlmProvider(
				config({ LLM_PROVIDER: provider }),
				gemini,
				local,
			);

			expect(selected).toBe(expected);
		},
	);

	it("rejects an unsupported provider without falling back", () => {
		expect(() =>
			selectInterviewLlmProvider(
				config({ LLM_PROVIDER: "cloud" }),
				gemini,
				local,
			),
		).toThrow("Unsupported LLM provider: cloud");
	});
});
