import type { GoogleGenAI } from "@google/genai";
import { jest } from "@jest/globals";
import { UnprocessableEntityException } from "@nestjs/common";
import type { AppConfigService } from "../../../types/index.js";
import { GeminiLlmAdapter } from "./gemini-llm.adapter.js";
import { GeminiSpeechToTextAdapter } from "./gemini-stt.adapter.js";
import { GeminiTextToSpeechAdapter } from "./gemini-tts.adapter.js";

type CreateFunction = (...args: any[]) => Promise<any>;

/** Creates typed provider configuration for adapter contract tests. */
function config(): AppConfigService {
	const values: Record<string, unknown> = {
		GEMINI_LLM_MODEL: "gemini-3.6-flash",
		GEMINI_STT_MODEL: "gemini-3.6-flash",
		GEMINI_TTS_MODEL: "gemini-3.1-flash-tts-preview",
		GEMINI_TTS_VOICE: "Kore",
		GEMINI_TIMEOUT_MS: 10_000,
	};
	return {
		get: (key: string) => values[key],
	} as unknown as AppConfigService;
}

/** Wraps one mocked Interactions create method as a Google client. */
function client(create: jest.Mock<CreateFunction>): GoogleGenAI {
	return { interactions: { create } } as unknown as GoogleGenAI;
}

/** Creates a fully typed async Interactions mock for test typechecking. */
function createMock(response?: any): jest.Mock<CreateFunction> {
	return jest.fn<CreateFunction>().mockResolvedValue(response);
}

describe("Gemini adapters", () => {
	it("structures raw questions with JSON Schema and validates the response", async () => {
		const create = createMock({
			status: "completed",
			output_text: JSON.stringify({
				questions: [
					{
						title: "React hooks",
						prompt: "Explain useEffect.",
						objective: null,
						followUpGuidance: null,
					},
				],
			}),
		});
		const adapter = new GeminiLlmAdapter(client(create), config());

		const result = await adapter.structureQuestions({
			interviewTitle: "Frontend",
			interviewDescription: null,
			rawQuestions: "Ask about hooks",
		});

		expect(result).toHaveLength(1);
		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				store: false,
				response_format: expect.objectContaining({
					mime_type: "application/json",
				}),
			}),
			expect.any(Object),
		);
		expect(
			JSON.stringify(create.mock.calls[0]?.[0].response_format.schema),
		).not.toMatch(/\$schema|minLength|maxLength|pattern|format/);
	});

	it("rejects malformed structured output before it reaches persistence", async () => {
		const adapter = new GeminiLlmAdapter(
			client(
				createMock({
					status: "completed",
					output_text: '{"questions":[]}',
				}),
			),
			config(),
		);

		await expect(
			adapter.structureQuestions({
				interviewTitle: "Frontend",
				interviewDescription: null,
				rawQuestions: "Ask something",
			}),
		).rejects.toThrow();
	});

	it("extracts only valid interviewer function calls", async () => {
		const validQuestion = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";
		const create = createMock({
			status: "requires_action",
			output_text: "Thank you for your answer.",
			steps: [
				{
					type: "function_call",
					name: "mark_question_completed",
					arguments: { questionIds: [validQuestion] },
				},
				{
					type: "function_call",
					name: "end_interview",
					arguments: { reason: "All tasks asked" },
				},
				{
					type: "function_call",
					name: "mark_question_completed",
					arguments: { questionIds: ["not-a-uuid"] },
				},
			],
		});
		const adapter = new GeminiLlmAdapter(client(create), config());

		const result = await adapter.generateTurn({
			interview: { title: "Frontend", description: null },
			candidate: { name: "Ada" },
			tasks: [],
			transcript: [],
			remainingSeconds: 60,
			mustEnd: false,
		});

		expect(result.actions).toEqual([
			{ type: "complete_questions", questionIds: [validQuestion] },
			{ type: "end_interview", reason: "All tasks asked" },
		]);
		const tools = create.mock.calls[0]?.[0].tools;
		expect(JSON.stringify(tools)).not.toMatch(
			/\$schema|minLength|maxLength|pattern|format/,
		);
	});

	it("uses the referenced active prompt for a tool-only completion", async () => {
		const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";
		const adapter = new GeminiLlmAdapter(
			client(
				createMock({
					status: "requires_action",
					steps: [
						{
							type: "function_call",
							name: "mark_question_completed",
							arguments: { questionIds: [questionId] },
						},
					],
				}),
			),
			config(),
		);

		await expect(
			adapter.generateTurn({
				interview: { title: "Frontend", description: null },
				candidate: { name: "Ada" },
				tasks: [
					{
						id: questionId,
						position: 1,
						title: "Hooks",
						prompt: "Explain useEffect.",
						objective: null,
						followUpGuidance: null,
						completed: false,
					},
				],
				transcript: [],
				remainingSeconds: 60,
				mustEnd: false,
			}),
		).resolves.toEqual(
			expect.objectContaining({
				text: "Hello Ada. Welcome to the Frontend interview. Explain useEffect.",
			}),
		);
	});

	it("rejects failed interactions and empty actionless responses", async () => {
		const failed = new GeminiLlmAdapter(
			client(
				createMock({
					status: "failed",
					output_text: '{"questions":[]}',
				}),
			),
			config(),
		);
		await expect(
			failed.structureQuestions({
				interviewTitle: "Frontend",
				interviewDescription: null,
				rawQuestions: "Ask something",
			}),
		).rejects.toThrow(/status: failed/);

		const empty = new GeminiLlmAdapter(
			client(createMock({ status: "completed", steps: [] })),
			config(),
		);
		await expect(
			empty.generateTurn({
				interview: { title: "Frontend", description: null },
				candidate: { name: "Ada" },
				tasks: [],
				transcript: [],
				remainingSeconds: 60,
				mustEnd: false,
			}),
		).rejects.toThrow(/neither spoken text nor an action/);
	});

	it("sends supported buffered audio and returns transcript text", async () => {
		const create = createMock({
			status: "completed",
			output_text: "  Candidate answer  ",
		});
		const adapter = new GeminiSpeechToTextAdapter(client(create), config());

		await expect(
			adapter.transcribe({
				bytes: Buffer.from("ogg"),
				mimeType: "Audio/OGG; codecs=opus",
				channels: 2,
			}),
		).resolves.toBe("Candidate answer");
		expect(create.mock.calls[0]?.[0].input[0]).toEqual(
			expect.objectContaining({
				type: "audio",
				mime_type: "audio/ogg",
				channels: 2,
			}),
		);
	});

	it("rejects unsupported browser audio before calling Gemini", async () => {
		const create = createMock();
		const adapter = new GeminiSpeechToTextAdapter(client(create), config());

		await expect(
			adapter.transcribe({
				bytes: Buffer.from("webm"),
				mimeType: "audio/webm",
			}),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
		expect(create).not.toHaveBeenCalled();
	});

	it("requires sample rate metadata for raw linear PCM", async () => {
		const create = createMock();
		const adapter = new GeminiSpeechToTextAdapter(client(create), config());

		await expect(
			adapter.transcribe({
				bytes: Buffer.from("pcm"),
				mimeType: "audio/l16",
			}),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
		expect(create).not.toHaveBeenCalled();
	});

	it("maps streamed audio deltas to the replaceable TTS port", async () => {
		async function* events() {
			yield {
				event_type: "step.delta",
				delta: {
					type: "audio",
					data: Buffer.from("pcm").toString("base64"),
					mime_type: "audio/l16",
					sample_rate: 24_000,
					channels: 1,
				},
			};
			yield {
				event_type: "interaction.completed",
				interaction: { id: "interaction-1", status: "completed" },
			};
		}
		const create = createMock(events());
		const adapter = new GeminiTextToSpeechAdapter(client(create), config());
		const chunks = [];

		for await (const chunk of adapter.synthesize({ text: "Hello" })) {
			chunks.push(chunk);
		}

		expect(Buffer.from(chunks[0]?.bytes ?? []).toString()).toBe("pcm");
		expect(create).toHaveBeenCalledWith(
			expect.not.objectContaining({ response_modalities: expect.anything() }),
			expect.any(Object),
		);
		expect(create.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				store: false,
				stream: true,
				response_format: expect.objectContaining({ type: "audio" }),
			}),
		);
	});

	it("rejects explicit and incomplete TTS stream failures", async () => {
		async function* errorEvents() {
			yield {
				event_type: "error",
				error: { message: "provider rejected audio" },
			};
		}
		const failed = new GeminiTextToSpeechAdapter(
			client(createMock(errorEvents())),
			config(),
		);
		await expect(async () => {
			for await (const _chunk of failed.synthesize({ text: "Hello" })) {
				// The provider fails before yielding audio.
			}
		}).rejects.toThrow(/provider rejected audio/);

		async function* incompleteEvents() {
			yield {
				event_type: "interaction.status_update",
				interaction_id: "interaction-1",
				status: "incomplete",
			};
		}
		const incomplete = new GeminiTextToSpeechAdapter(
			client(createMock(incompleteEvents())),
			config(),
		);
		await expect(async () => {
			for await (const _chunk of incomplete.synthesize({ text: "Hello" })) {
				// The provider fails before yielding audio.
			}
		}).rejects.toThrow(/status: incomplete/);
	});
});
