import type { GoogleGenAI } from "@google/genai";
import { jest } from "@jest/globals";
import { UnprocessableEntityException } from "@nestjs/common";
import type { AppConfigService } from "../../../types/index.js";
import { GeminiLlmAdapter } from "./gemini-llm.adapter.js";
import { GeminiSpeechToTextAdapter } from "./gemini-stt.adapter.js";
import { GeminiTextToSpeechAdapter } from "./gemini-tts.adapter.js";

type CreateFunction = (...args: any[]) => Promise<any>;
type GenerateContentFunction = (...args: any[]) => Promise<any>;

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

/** Wraps one mocked non-streaming model call as a Google client. */
function ttsClient(
	generateContent: jest.Mock<GenerateContentFunction>,
): GoogleGenAI {
	return { models: { generateContent } } as unknown as GoogleGenAI;
}

/** Creates a typed non-streaming model mock for completed TTS responses. */
function generateContentMock(
	response?: any,
): jest.Mock<GenerateContentFunction> {
	return jest.fn<GenerateContentFunction>().mockResolvedValue(response);
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
		const request = create.mock.calls[0]?.[0];
		expect(request.input).toEqual([
			{ type: "text", text: "Transcribe this candidate response." },
			{
				type: "audio",
				data: Buffer.from("ogg").toString("base64"),
				mime_type: "audio/ogg",
			},
		]);
		expect(request).not.toHaveProperty("response_format");
	});

	it.each([
		{
			channels: 1,
			pcm: Buffer.from([0x00, 0x80, 0xff, 0x7f]),
			sampleRateHz: 16_000,
		},
		{
			channels: 2,
			pcm: Buffer.from([0x00, 0x80, 0xff, 0x7f]),
			sampleRateHz: 48_000,
		},
	])(
		"wraps $channels-channel raw PCM in a valid WAV provider payload",
		async ({ channels, pcm, sampleRateHz }) => {
			const create = createMock({ status: "completed", output_text: "answer" });
			const adapter = new GeminiSpeechToTextAdapter(client(create), config());

			await adapter.transcribe({
				bytes: pcm,
				channels,
				mimeType: "audio/l16",
				sampleRateHz,
			});

			const audio = create.mock.calls[0]?.[0].input.find(
				(item: { type: string }) => item.type === "audio",
			);
			expect(audio).toEqual({
				type: "audio",
				data: expect.any(String),
				mime_type: "audio/wav",
			});
			const wave = Buffer.from(audio.data, "base64");
			expect(wave.toString("ascii", 0, 4)).toBe("RIFF");
			expect(wave.readUInt32LE(4)).toBe(36 + pcm.byteLength);
			expect(wave.toString("ascii", 8, 12)).toBe("WAVE");
			expect(wave.toString("ascii", 12, 16)).toBe("fmt ");
			expect(wave.readUInt32LE(16)).toBe(16);
			expect(wave.readUInt16LE(20)).toBe(1);
			expect(wave.readUInt16LE(22)).toBe(channels);
			expect(wave.readUInt32LE(24)).toBe(sampleRateHz);
			expect(wave.readUInt32LE(28)).toBe(sampleRateHz * channels * 2);
			expect(wave.readUInt16LE(32)).toBe(channels * 2);
			expect(wave.readUInt16LE(34)).toBe(16);
			expect(wave.toString("ascii", 36, 40)).toBe("data");
			expect(wave.readUInt32LE(40)).toBe(pcm.byteLength);
			expect(wave.subarray(44)).toEqual(pcm);
		},
	);

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

	it.each([
		{ bytes: Buffer.from([0x00]), channels: 1 },
		{ bytes: Buffer.from([0x00, 0x00]), channels: 2 },
	])(
		"rejects incomplete $channels-channel PCM frames before Gemini",
		async ({ bytes, channels }) => {
			const create = createMock();
			const adapter = new GeminiSpeechToTextAdapter(client(create), config());

			await expect(
				adapter.transcribe({
					bytes,
					channels,
					mimeType: "audio/l16",
					sampleRateHz: 16_000,
				}),
			).rejects.toBeInstanceOf(UnprocessableEntityException);
			expect(create).not.toHaveBeenCalled();
		},
	);

	it("maps one completed audio response to one TTS port chunk", async () => {
		const generateContent = generateContentMock({
			candidates: [
				{
					content: {
						parts: [
							{
								inlineData: {
									data: Buffer.from("pcm!").toString("base64"),
									mimeType: "audio/L16;codec=pcm;rate=24000",
								},
							},
						],
					},
					finishReason: "STOP",
				},
			],
		});
		const adapter = new GeminiTextToSpeechAdapter(
			ttsClient(generateContent),
			config(),
		);
		const chunk = await adapter.synthesize({ text: "Hello" });

		expect(chunk).toEqual(
			expect.objectContaining({
				channels: 1,
				mimeType: "audio/L16;codec=pcm;rate=24000",
				sampleRateHz: 24_000,
			}),
		);
		expect(Buffer.from(chunk.bytes).toString()).toBe("pcm!");
		expect(generateContent).toHaveBeenCalledTimes(1);
		const request = generateContent.mock.calls[0]?.[0];
		expect(request).toEqual(
			expect.objectContaining({
				config: expect.objectContaining({
					httpOptions: {
						retryOptions: { attempts: 2 },
						timeout: 10_000,
					},
					responseModalities: ["AUDIO"],
					speechConfig: {
						voiceConfig: {
							prebuiltVoiceConfig: { voiceName: "Kore" },
						},
					},
				}),
			}),
		);
		expect(request).not.toHaveProperty("stream");
	});

	it("rejects missing and unsupported completed TTS audio", async () => {
		const missing = new GeminiTextToSpeechAdapter(
			ttsClient(generateContentMock({ candidates: [] })),
			config(),
		);
		await expect(missing.synthesize({ text: "Hello" })).rejects.toThrow(
			/no completed audio/,
		);

		const unsupported = new GeminiTextToSpeechAdapter(
			ttsClient(
				generateContentMock({
					candidates: [
						{
							content: {
								parts: [
									{
										inlineData: {
											data: Buffer.from("wave").toString("base64"),
											mimeType: "audio/wav",
										},
									},
								],
							},
						},
					],
				}),
			),
			config(),
		);
		await expect(unsupported.synthesize({ text: "Hello" })).rejects.toThrow(
			/unsupported audio type/,
		);
	});
});
