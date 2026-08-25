import { jest } from "@jest/globals";
import type {
	GeneratedInterviewTurn,
	InterviewLlmPort,
} from "#src/modules/ai/llm/llm.port.js";
import type { SpeechToTextPort } from "#src/modules/ai/stt/stt.port.js";
import type { TextToSpeechPort } from "#src/modules/ai/tts/tts.port.js";
import type { AttemptSnapshot } from "./dto/response.dto.js";
import type { InterviewAttemptStateService } from "./interview-attempt-state.service.js";
import type { InterviewConversationService } from "./interview-conversation.service.js";
import { InterviewOrchestratorService } from "./interview-orchestrator.service.js";
import type { BufferedCandidateAudio } from "./realtime/interview-realtime.protocol.js";

const candidate = {
	id: "4b8757d8-b56b-47eb-827f-65b14977fa25",
	name: "Ada Candidate",
	email: "ada@example.com",
	emailVerified: false,
	image: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const attemptId = "f0c765b0-a9fe-4a67-bf75-a63486949831";
const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";
const futureQuestionId = "83e0c06d-cbbf-47db-80fe-9da1bc4d37b0";
const turnId = "19ad8c03-9e89-4d23-b393-d3cd6a654900";
const candidateStartedAt = new Date("2026-08-01T00:05:00.000Z");
const candidateEndedAt = new Date("2026-08-01T00:05:12.000Z");

/** Creates a typed resolved async Jest mock without `never` inference. */
function asyncMock<T>(value: T) {
	return jest.fn<(...args: any[]) => Promise<T>>().mockResolvedValue(value);
}

/** Creates a typed rejected async Jest mock without `never` inference. */
function rejectedAsyncMock(error: Error) {
	return jest.fn<(...args: any[]) => Promise<never>>().mockRejectedValue(error);
}

/** Builds a correctly typed LLM double with an optional next-turn result. */
function createLlm(result?: GeneratedInterviewTurn) {
	const generateTurn = jest.fn<InterviewLlmPort["generateTurn"]>();
	if (result) generateTurn.mockResolvedValue(result);
	return {
		structureQuestions: jest.fn<InterviewLlmPort["structureQuestions"]>(),
		generateTurn,
	};
}

/** Builds one public snapshot for orchestration state assertions. */
function snapshot(
	state: AttemptSnapshot["state"],
	turns: AttemptSnapshot["turns"] = [],
): AttemptSnapshot {
	return {
		id: attemptId,
		state,
		startedAt: "2026-08-01T00:00:00.000Z",
		deadlineAt: "2026-08-01T00:30:00.000Z",
		endedAt: state === "COMPLETED" ? "2026-08-01T00:10:00.000Z" : null,
		endReason: state === "COMPLETED" ? "AI_COMPLETED" : null,
		media: {
			cameraActive: false,
			screenActive: false,
			microphoneActive: false,
		},
		turns,
	};
}

/** Builds server-owned model context with one pending task. */
function modelContext() {
	return {
		interview: { title: "Frontend", description: null },
		candidate: {
			name: candidate.name,
			variationKey: "opaque-attempt-variation-key",
		},
		tasks: [
			{
				id: questionId,
				position: 1,
				title: "Hooks",
				prompt: "Explain useEffect",
				objective: null,
				followUpGuidance: null,
				completed: false,
				turnCount: 0,
			},
			{
				id: futureQuestionId,
				position: 2,
				title: "Debugging",
				prompt: "Describe a difficult bug",
				objective: null,
				followUpGuidance: null,
				completed: false,
				turnCount: 0,
			},
		],
		transcript: [],
		remainingSeconds: 1200,
		mustEnd: false,
	};
}

/** Produces one completed provider-neutral TTS response. */
async function speechResponse() {
	return {
		bytes: Buffer.from("complete wave"),
		mimeType: "audio/wav",
		sampleRateHz: 24_000,
		channels: 1,
	};
}

/** Builds buffered candidate audio with its server-recorded speaking range. */
function candidateAudio(bytes = Buffer.from("audio")): BufferedCandidateAudio {
	return {
		attemptId,
		turnId,
		mimeType: "audio/wav",
		channels: 1,
		bytes,
		startedAt: candidateStartedAt,
		endedAt: candidateEndedAt,
	};
}

describe("InterviewOrchestratorService", () => {
	it("uses the LLM for a personalized opening without completing its topic", async () => {
		const state = {
			finishAssistantSpeech: asyncMock(snapshot("LISTENING")),
			claimDeadline: asyncMock(false),
		};
		const conversation = {
			loadModelContext: asyncMock(modelContext()),
			saveAssistantTurn: asyncMock({
				id: turnId,
				text: "Welcome, Ada. How have effects shaped the React work you have done?",
				shouldEnd: false,
				endReason: null,
			}),
			finishAssistantTurn: asyncMock(undefined),
		};
		const llm = createLlm({
			text: "Welcome, Ada. How have effects shaped the React work you have done?",
			actions: [{ type: "complete_questions", questionIds: [questionId] }],
		});
		const tts: TextToSpeechPort = { synthesize: speechResponse };
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			conversation as unknown as InterviewConversationService,
			llm,
			{ transcribe: jest.fn<SpeechToTextPort["transcribe"]>() },
			tts,
		);
		const events: Array<{ event: string; payload: any }> = [];

		await service.runAssistant(
			attemptId,
			candidate,
			snapshot("ASSISTANT_SPEAKING"),
			(event, payload) => events.push({ event, payload }),
		);

		expect(llm.generateTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				tasks: modelContext().tasks,
				transcript: [],
			}),
		);
		expect(conversation.saveAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			candidate,
			{
				text: "Welcome, Ada. How have effects shaped the React work you have done?",
				completedQuestionIds: [],
				engagedQuestionId: questionId,
				endRequested: false,
				forceEnd: false,
			},
		);
		expect(events.map(({ event }) => event)).toEqual(
			expect.arrayContaining([
				"assistant:subtitle",
				"assistant:audio:chunk",
				"assistant:turn:end",
			]),
		);
		const audioEvents = events.filter(
			({ event }) => event === "assistant:audio:chunk",
		);
		expect(audioEvents).toHaveLength(1);
		expect(audioEvents[0]?.payload).toEqual({
			turnId,
			sequence: 0,
			mimeType: "audio/wav",
			sampleRateHz: 24_000,
			channels: 1,
			data: Buffer.from("complete wave"),
		});
		expect(
			events.findIndex(({ event }) => event === "assistant:audio:chunk"),
		).toBeLessThan(
			events.findIndex(({ event }) => event === "assistant:turn:end"),
		);
		expect(conversation.finishAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			turnId,
		);
		expect(events.at(-1)?.payload.state).toBe("LISTENING");
	});

	it("finishes a recovered assistant turn even when audio is unavailable", async () => {
		const state = {
			finishAssistantSpeech: asyncMock(snapshot("LISTENING")),
			claimDeadline: asyncMock(false),
		};
		const conversation = {
			loadModelContext: jest.fn(),
			finishAssistantTurn: asyncMock(undefined),
		};
		const llm = createLlm();
		const events: Array<{ event: string; payload: unknown }> = [];
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			conversation as unknown as InterviewConversationService,
			llm,
			{ transcribe: jest.fn<SpeechToTextPort["transcribe"]>() },
			{
				synthesize: rejectedAsyncMock(new Error("TTS unavailable")),
			},
		);
		const recovered = snapshot("ASSISTANT_SPEAKING", [
			{
				id: turnId,
				sequence: 1,
				role: "assistant",
				text: "Let us continue with the next question.",
				startedAt: "2026-08-01T00:04:00.000Z",
				endedAt: null,
				createdAt: "2026-08-01T00:04:00.000Z",
			},
		]);

		await service.runAssistant(
			attemptId,
			candidate,
			recovered,
			(event, payload) => events.push({ event, payload }),
		);

		expect(llm.generateTurn).not.toHaveBeenCalled();
		expect(conversation.loadModelContext).not.toHaveBeenCalled();
		expect(conversation.finishAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			turnId,
		);
		expect(events).toContainEqual({
			event: "attempt:error",
			payload: expect.objectContaining({ code: "AUDIO_UNAVAILABLE" }),
		});
		expect(events.map(({ event }) => event)).toContain("assistant:turn:end");
	});

	it("restores and emits LISTENING when transcription fails", async () => {
		const listening = snapshot("LISTENING");
		const state = {
			claimCandidateTurn: asyncMock({ claimed: true, duplicate: false }),
			findSnapshot: asyncMock(snapshot("PROCESSING")),
			restoreListening: asyncMock(listening),
			claimDeadline: asyncMock(false),
		};
		const events: Array<{ event: string; payload: any }> = [];
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			{} as InterviewConversationService,
			createLlm(),
			{ transcribe: rejectedAsyncMock(new Error("STT unavailable")) },
			{ synthesize: speechResponse },
		);

		await service.processCandidateAudio(
			candidateAudio(),
			candidate,
			(event, payload) => events.push({ event, payload }),
		);

		expect(events).toContainEqual({
			event: "attempt:state",
			payload: listening,
		});
		expect(events).toContainEqual({
			event: "attempt:error",
			payload: expect.objectContaining({ code: "TRANSCRIPTION_FAILED" }),
		});
	});

	it("transcribes a candidate turn and emits final completion", async () => {
		const completed = snapshot("COMPLETED");
		const assistantTurnId = "8f5a5033-020b-4187-88d7-2d7a07e53917";
		const state = {
			claimCandidateTurn: asyncMock({ claimed: true, duplicate: false }),
			findSnapshot: asyncMock(snapshot("PROCESSING")),
			finishAssistantSpeech: asyncMock(completed),
			claimDeadline: asyncMock(false),
		};
		const conversation = {
			saveCandidateTranscript: asyncMock({
				id: turnId,
				text: "My candidate answer",
			}),
			loadModelContext: asyncMock({
				...modelContext(),
				mustEnd: true,
				remainingSeconds: 0,
			}),
			saveAssistantTurn: asyncMock({
				id: assistantTurnId,
				text: "Thank you. This interview is complete.",
				shouldEnd: true,
				endReason: "TIME_LIMIT",
			}),
			finishAssistantTurn: asyncMock(undefined),
		};
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			conversation as unknown as InterviewConversationService,
			createLlm({
				text: "Thank you. This interview is complete.",
				actions: [{ type: "end_interview", reason: "done" }],
			}),
			{ transcribe: asyncMock("My candidate answer") },
			{ synthesize: speechResponse },
		);
		const events: string[] = [];

		await service.processCandidateAudio(candidateAudio(), candidate, (event) =>
			events.push(event),
		);

		expect(conversation.saveCandidateTranscript).toHaveBeenCalledWith(
			attemptId,
			turnId,
			"My candidate answer",
			candidate,
			{ startedAt: candidateStartedAt, endedAt: candidateEndedAt },
		);
		expect(conversation.finishAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			assistantTurnId,
		);
		expect(events).toContain("candidate:transcript");
		expect(events).toContain("attempt:ended");
	});

	it("restores listening and does not call the LLM when speech is empty", async () => {
		const state = {
			claimCandidateTurn: asyncMock({ claimed: true, duplicate: false }),
			findSnapshot: asyncMock(snapshot("PROCESSING")),
			restoreListening: asyncMock(snapshot("LISTENING")),
			claimDeadline: asyncMock(false),
		};
		const llm = createLlm();
		const errors: any[] = [];
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			{} as InterviewConversationService,
			llm,
			{ transcribe: asyncMock("   ") },
			{ synthesize: speechResponse },
		);

		await service.processCandidateAudio(
			candidateAudio(Buffer.from("silence")),
			candidate,
			(event, payload) => {
				if (event === "attempt:error") errors.push(payload);
			},
		);

		expect(state.restoreListening).toHaveBeenCalledTimes(1);
		expect(llm.generateTurn).not.toHaveBeenCalled();
		expect(errors).toContainEqual(
			expect.objectContaining({ code: "NO_SPEECH" }),
		);
	});

	it("allows one conversational follow-up and refuses a premature end", async () => {
		const state = {
			finishAssistantSpeech: asyncMock(snapshot("LISTENING")),
			claimDeadline: asyncMock(false),
		};
		const conversation = {
			loadModelContext: asyncMock({
				...modelContext(),
				tasks: modelContext().tasks.map((task, index) => ({
					...task,
					turnCount: index === 0 ? 1 : 0,
				})),
				transcript: [{ role: "candidate" as const, text: "Previous answer" }],
			}),
			saveAssistantTurn: asyncMock({
				id: turnId,
				text: "That is a useful example. What trade-off did you notice?",
				shouldEnd: false,
				endReason: null,
			}),
			finishAssistantTurn: asyncMock(undefined),
		};
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			conversation as unknown as InterviewConversationService,
			createLlm({
				text: "That is a useful example. What trade-off did you notice?",
				actions: [{ type: "end_interview", reason: "too early" }],
			}),
			{ transcribe: jest.fn<SpeechToTextPort["transcribe"]>() },
			{ synthesize: speechResponse },
		);

		await service.runAssistant(
			attemptId,
			candidate,
			snapshot("ASSISTANT_SPEAKING"),
			jest.fn(),
		);

		expect(conversation.saveAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			candidate,
			{
				text: "That is a useful example. What trade-off did you notice?",
				completedQuestionIds: [],
				engagedQuestionId: questionId,
				endRequested: false,
				forceEnd: false,
			},
		);
	});

	it("forces advancement after the optional follow-up and engages the next topic", async () => {
		const tasks = modelContext().tasks.map((task, index) => ({
			...task,
			turnCount: index === 0 ? 2 : 0,
		}));
		const state = {
			finishAssistantSpeech: asyncMock(snapshot("LISTENING")),
			claimDeadline: asyncMock(false),
		};
		const conversation = {
			loadModelContext: asyncMock({
				...modelContext(),
				tasks,
				transcript: [
					{ role: "candidate" as const, text: "A more detailed answer" },
				],
			}),
			saveAssistantTurn: asyncMock({
				id: turnId,
				text: "Thanks for expanding on that. Tell me about a bug that challenged you.",
				shouldEnd: false,
				endReason: null,
			}),
			finishAssistantTurn: asyncMock(undefined),
		};
		const llm = createLlm({
			text: "Thanks for expanding on that. Tell me about a bug that challenged you.",
			actions: [],
		});
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			conversation as unknown as InterviewConversationService,
			llm,
			{ transcribe: jest.fn<SpeechToTextPort["transcribe"]>() },
			{ synthesize: speechResponse },
		);

		await service.runAssistant(
			attemptId,
			candidate,
			snapshot("ASSISTANT_SPEAKING"),
			jest.fn(),
		);

		expect(llm.generateTurn).toHaveBeenCalledWith(
			expect.objectContaining({ tasks }),
		);
		expect(conversation.saveAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			candidate,
			{
				text: "Thanks for expanding on that. Tell me about a bug that challenged you.",
				completedQuestionIds: [questionId],
				engagedQuestionId: futureQuestionId,
				endRequested: false,
				forceEnd: false,
			},
		);
	});

	it("completes the final topic without attributing the closing turn to a topic", async () => {
		const tasks = modelContext().tasks.map((task, index) => ({
			...task,
			completed: index === 0,
			turnCount: 1,
		}));
		const state = {
			finishAssistantSpeech: asyncMock(snapshot("COMPLETED")),
			claimDeadline: asyncMock(false),
		};
		const conversation = {
			loadModelContext: asyncMock({
				...modelContext(),
				tasks,
				transcript: [
					{ role: "candidate" as const, text: "That is how I fixed it." },
				],
			}),
			saveAssistantTurn: asyncMock({
				id: turnId,
				text: "Thank you for walking me through that. This concludes our interview.",
				shouldEnd: true,
				endReason: "AI_COMPLETED" as const,
			}),
			finishAssistantTurn: asyncMock(undefined),
		};
		const llm = createLlm({
			text: "Thank you for walking me through that. This concludes our interview.",
			actions: [
				{ type: "complete_questions", questionIds: [futureQuestionId] },
				{ type: "end_interview", reason: "All topics completed" },
			],
		});
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			conversation as unknown as InterviewConversationService,
			llm,
			{ transcribe: jest.fn<SpeechToTextPort["transcribe"]>() },
			{ synthesize: speechResponse },
		);

		await service.runAssistant(
			attemptId,
			candidate,
			snapshot("ASSISTANT_SPEAKING"),
			jest.fn(),
		);

		expect(llm.generateTurn).toHaveBeenCalledWith(
			expect.objectContaining({ tasks: [tasks[1]] }),
		);
		expect(conversation.saveAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			candidate,
			{
				text: "Thank you for walking me through that. This concludes our interview.",
				completedQuestionIds: [futureQuestionId],
				engagedQuestionId: null,
				endRequested: true,
				forceEnd: false,
			},
		);
	});

	it("closes after a provider failure when the deadline elapsed during work", async () => {
		const continuingContext = {
			...modelContext(),
			transcript: [{ role: "candidate" as const, text: "Previous answer" }],
		};
		const loadModelContext = asyncMock(continuingContext);
		loadModelContext
			.mockResolvedValueOnce(continuingContext)
			.mockResolvedValueOnce({
				...modelContext(),
				remainingSeconds: 0,
				mustEnd: true,
			});
		const state = {
			claimDeadline: asyncMock(true),
			findSnapshot: asyncMock(snapshot("PROCESSING")),
			finishAssistantSpeech: asyncMock(snapshot("COMPLETED")),
		};
		const conversation = {
			loadModelContext,
			saveAssistantTurn: asyncMock({
				id: turnId,
				text: "Thank you for your time.",
				shouldEnd: true,
				endReason: "TIME_LIMIT",
			}),
			finishAssistantTurn: asyncMock(undefined),
		};
		const llm = createLlm();
		llm.generateTurn.mockRejectedValue(new Error("LLM timeout"));
		const events: string[] = [];
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			conversation as unknown as InterviewConversationService,
			llm,
			{ transcribe: jest.fn<SpeechToTextPort["transcribe"]>() },
			{ synthesize: speechResponse },
		);

		await service.runAssistant(
			attemptId,
			candidate,
			snapshot("ASSISTANT_SPEAKING"),
			(event) => events.push(event),
		);

		expect(conversation.saveAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			candidate,
			expect.objectContaining({ forceEnd: true }),
		);
		expect(events).toContain("attempt:ended");
	});

	it("ignores a replayed candidate turn before calling providers", async () => {
		const state = {
			claimCandidateTurn: asyncMock({ claimed: false, duplicate: true }),
		};
		const stt = { transcribe: jest.fn<SpeechToTextPort["transcribe"]>() };
		const service = new InterviewOrchestratorService(
			state as unknown as InterviewAttemptStateService,
			{} as InterviewConversationService,
			createLlm(),
			stt,
			{ synthesize: speechResponse },
		);

		await service.processCandidateAudio(candidateAudio(), candidate, jest.fn());

		expect(stt.transcribe).not.toHaveBeenCalled();
	});
});
