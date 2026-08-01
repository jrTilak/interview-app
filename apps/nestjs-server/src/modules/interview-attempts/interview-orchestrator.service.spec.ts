import { jest } from "@jest/globals";
import type {
	GeneratedInterviewTurn,
	InterviewLlmPort,
	SpeechToTextPort,
	TextToSpeechPort,
} from "../ai/ai.ports.js";
import type { AttemptSnapshot } from "./dto/response.dto.js";
import type { InterviewAttemptsService } from "./interview-attempts.service.js";
import { InterviewOrchestratorService } from "./interview-orchestrator.service.js";

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
		candidate: { name: candidate.name },
		tasks: [
			{
				id: questionId,
				position: 1,
				title: "Hooks",
				prompt: "Explain useEffect",
				objective: null,
				followUpGuidance: null,
				completed: false,
			},
			{
				id: futureQuestionId,
				position: 2,
				title: "Debugging",
				prompt: "Describe a difficult bug",
				objective: null,
				followUpGuidance: null,
				completed: false,
			},
		],
		transcript: [],
		remainingSeconds: 1200,
		mustEnd: false,
	};
}

/** Produces provider-sized chunks that must become one client audio block. */
async function* speechStream() {
	yield {
		bytes: Buffer.from("continuous "),
		mimeType: "audio/l16",
		sampleRateHz: 24_000,
		channels: 1,
	};
	yield {
		bytes: Buffer.from("voice"),
		mimeType: "audio/l16",
		sampleRateHz: 24_000,
		channels: 1,
	};
}

describe("InterviewOrchestratorService", () => {
	it("starts with a greeting, scopes model tool IDs, coalesces TTS, and listens", async () => {
		const attempts = {
			start: asyncMock({
				snapshot: snapshot("ASSISTANT_SPEAKING"),
				shouldRunAssistant: true,
			}),
			loadModelContext: asyncMock(modelContext()),
			saveAssistantTurn: asyncMock({
				id: turnId,
				text: "Hello Ada. Explain useEffect.",
				shouldEnd: false,
				endReason: null,
			}),
			finishAssistantSpeech: asyncMock(snapshot("LISTENING")),
			claimDeadline: asyncMock(false),
		};
		const llm = createLlm({
			text: "Hello Ada. Explain useEffect.",
			actions: [
				{
					type: "complete_questions",
					questionIds: [questionId, futureQuestionId],
				},
			],
		});
		const tts: TextToSpeechPort = { synthesize: speechStream };
		const service = new InterviewOrchestratorService(
			attempts as unknown as InterviewAttemptsService,
			llm,
			{ transcribe: jest.fn<SpeechToTextPort["transcribe"]>() },
			tts,
		);
		const events: Array<{ event: string; payload: any }> = [];

		await service.start(attemptId, candidate, (event, payload) =>
			events.push({ event, payload }),
		);

		expect(attempts.saveAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			candidate,
			expect.objectContaining({ completedQuestionIds: [questionId] }),
		);
		expect(llm.generateTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				candidate: { name: candidate.name },
				tasks: [expect.objectContaining({ id: questionId })],
			}),
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
			mimeType: "audio/l16",
			sampleRateHz: 24_000,
			channels: 1,
			data: Buffer.from("continuous voice"),
		});
		expect(
			events.findIndex(({ event }) => event === "assistant:audio:chunk"),
		).toBeLessThan(
			events.findIndex(({ event }) => event === "assistant:turn:end"),
		);
		expect(events.at(-1)?.payload.state).toBe("LISTENING");
	});

	it("restores and emits LISTENING when transcription fails", async () => {
		const listening = snapshot("LISTENING");
		const attempts = {
			claimCandidateTurn: asyncMock({ claimed: true, duplicate: false }),
			findSnapshot: asyncMock(snapshot("PROCESSING")),
			restoreListening: asyncMock(listening),
			claimDeadline: asyncMock(false),
		};
		const events: Array<{ event: string; payload: any }> = [];
		const service = new InterviewOrchestratorService(
			attempts as unknown as InterviewAttemptsService,
			createLlm(),
			{ transcribe: rejectedAsyncMock(new Error("STT unavailable")) },
			{ synthesize: speechStream },
		);

		await service.processCandidateAudio(
			{
				attemptId,
				turnId,
				mimeType: "audio/wav",
				channels: 1,
				bytes: Buffer.from("audio"),
			},
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
		const attempts = {
			claimCandidateTurn: asyncMock({ claimed: true, duplicate: false }),
			findSnapshot: asyncMock(snapshot("PROCESSING")),
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
				id: "8f5a5033-020b-4187-88d7-2d7a07e53917",
				text: "Thank you. This interview is complete.",
				shouldEnd: true,
				endReason: "TIME_LIMIT",
			}),
			finishAssistantSpeech: asyncMock(completed),
			claimDeadline: asyncMock(false),
		};
		const service = new InterviewOrchestratorService(
			attempts as unknown as InterviewAttemptsService,
			createLlm({
				text: "Thank you. This interview is complete.",
				actions: [{ type: "end_interview", reason: "done" }],
			}),
			{ transcribe: asyncMock("My candidate answer") },
			{ synthesize: speechStream },
		);
		const events: string[] = [];

		await service.processCandidateAudio(
			{
				attemptId,
				turnId,
				mimeType: "audio/wav",
				channels: 1,
				bytes: Buffer.from("audio"),
			},
			candidate,
			(event) => events.push(event),
		);

		expect(attempts.saveCandidateTranscript).toHaveBeenCalledTimes(1);
		expect(events).toContain("candidate:transcript");
		expect(events).toContain("attempt:ended");
	});

	it("restores listening and does not call the LLM when speech is empty", async () => {
		const attempts = {
			claimCandidateTurn: asyncMock({ claimed: true, duplicate: false }),
			findSnapshot: asyncMock(snapshot("PROCESSING")),
			restoreListening: asyncMock(snapshot("LISTENING")),
			claimDeadline: asyncMock(false),
		};
		const llm = createLlm();
		const errors: any[] = [];
		const service = new InterviewOrchestratorService(
			attempts as unknown as InterviewAttemptsService,
			llm,
			{ transcribe: asyncMock("   ") },
			{ synthesize: speechStream },
		);

		await service.processCandidateAudio(
			{
				attemptId,
				turnId,
				mimeType: "audio/wav",
				channels: 1,
				bytes: Buffer.from("silence"),
			},
			candidate,
			(event, payload) => {
				if (event === "attempt:error") errors.push(payload);
			},
		);

		expect(attempts.restoreListening).toHaveBeenCalledTimes(1);
		expect(llm.generateTurn).not.toHaveBeenCalled();
		expect(errors).toContainEqual(
			expect.objectContaining({ code: "NO_SPEECH" }),
		);
	});

	it("refuses a premature end tool while a task is still pending", async () => {
		const attempts = {
			start: asyncMock({
				snapshot: snapshot("ASSISTANT_SPEAKING"),
				shouldRunAssistant: true,
			}),
			loadModelContext: asyncMock(modelContext()),
			saveAssistantTurn: asyncMock({
				id: turnId,
				text: "Let us continue. Explain useEffect",
				shouldEnd: false,
				endReason: null,
			}),
			finishAssistantSpeech: asyncMock(snapshot("LISTENING")),
			claimDeadline: asyncMock(false),
		};
		const service = new InterviewOrchestratorService(
			attempts as unknown as InterviewAttemptsService,
			createLlm({
				text: "Thank you, goodbye.",
				actions: [
					{
						type: "complete_questions",
						questionIds: [questionId, futureQuestionId],
					},
					{ type: "end_interview", reason: "too early" },
				],
			}),
			{ transcribe: jest.fn<SpeechToTextPort["transcribe"]>() },
			{ synthesize: speechStream },
		);

		await service.start(attemptId, candidate, jest.fn());

		expect(attempts.saveAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			candidate,
			{
				text: "Let us continue. Explain useEffect",
				completedQuestionIds: [questionId],
				endRequested: false,
				forceEnd: false,
			},
		);
	});

	it("closes after a provider failure when the deadline elapsed during work", async () => {
		const loadModelContext = asyncMock(modelContext());
		loadModelContext
			.mockResolvedValueOnce(modelContext())
			.mockResolvedValueOnce({
				...modelContext(),
				remainingSeconds: 0,
				mustEnd: true,
			});
		const attempts = {
			start: asyncMock({
				snapshot: snapshot("ASSISTANT_SPEAKING"),
				shouldRunAssistant: true,
			}),
			loadModelContext,
			claimDeadline: asyncMock(true),
			findSnapshot: asyncMock(snapshot("PROCESSING")),
			saveAssistantTurn: asyncMock({
				id: turnId,
				text: "Thank you for your time.",
				shouldEnd: true,
				endReason: "TIME_LIMIT",
			}),
			finishAssistantSpeech: asyncMock(snapshot("COMPLETED")),
		};
		const llm = createLlm();
		llm.generateTurn.mockRejectedValue(new Error("LLM timeout"));
		const events: string[] = [];
		const service = new InterviewOrchestratorService(
			attempts as unknown as InterviewAttemptsService,
			llm,
			{ transcribe: jest.fn<SpeechToTextPort["transcribe"]>() },
			{ synthesize: speechStream },
		);

		await service.start(attemptId, candidate, (event) => events.push(event));

		expect(attempts.saveAssistantTurn).toHaveBeenCalledWith(
			attemptId,
			candidate,
			expect.objectContaining({ forceEnd: true }),
		);
		expect(events).toContain("attempt:ended");
	});

	it("ignores a replayed candidate turn before calling providers", async () => {
		const attempts = {
			claimCandidateTurn: asyncMock({ claimed: false, duplicate: true }),
		};
		const stt = { transcribe: jest.fn<SpeechToTextPort["transcribe"]>() };
		const service = new InterviewOrchestratorService(
			attempts as unknown as InterviewAttemptsService,
			createLlm(),
			stt,
			{ synthesize: speechStream },
		);

		await service.processCandidateAudio(
			{
				attemptId,
				turnId,
				mimeType: "audio/wav",
				channels: 1,
				bytes: Buffer.from("audio"),
			},
			candidate,
			jest.fn(),
		);

		expect(stt.transcribe).not.toHaveBeenCalled();
	});
});
