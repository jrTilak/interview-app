import { Inject, Injectable, Logger } from "@nestjs/common";
import type { User } from "better-auth/types";
import {
	type GeneratedInterviewTurn,
	INTERVIEW_LLM,
	type InterviewLlmPort,
	SPEECH_TO_TEXT,
	type SpeechToTextPort,
	TEXT_TO_SPEECH,
	type TextToSpeechPort,
} from "../ai/ai.ports.js";
import { InterviewAttemptsService } from "./interview-attempts.service.js";
import type {
	BufferedCandidateAudio,
	InterviewEventEmitter,
} from "./realtime/interview-realtime.protocol.js";

@Injectable()
export class InterviewOrchestratorService {
	private readonly _logger = new Logger(InterviewOrchestratorService.name);
	private readonly _runningAttempts = new Set<string>();
	private static readonly _MAX_INTERVIEWER_TEXT_LENGTH = 4_000;
	private static readonly _MAX_TRANSCRIPT_LENGTH = 10_000;
	private static readonly _MAX_TTS_BYTES = 20 * 1024 * 1024;

	constructor(
		private readonly _attempts: InterviewAttemptsService,
		@Inject(INTERVIEW_LLM)
		private readonly _llm: InterviewLlmPort,
		@Inject(SPEECH_TO_TEXT)
		private readonly _speechToText: SpeechToTextPort,
		@Inject(TEXT_TO_SPEECH)
		private readonly _textToSpeech: TextToSpeechPort,
	) {}

	/** Emits one safe, provider-neutral realtime failure. */
	private _emitFailure(
		emit: InterviewEventEmitter,
		code: string,
		message: string,
		retryable: boolean,
	): void {
		emit("attempt:error", { code, message, retryable });
	}

	/** Finalizes an attempt if its deadline elapsed while another turn was active. */
	private async _checkDeadlineAfterWork(
		attemptId: string,
		candidate: User,
		emit: InterviewEventEmitter,
	): Promise<void> {
		try {
			await this.handleDeadline(attemptId, candidate, emit);
		} catch (error) {
			this._logger.error("Interview deadline orchestration failed", error);
			this._emitFailure(
				emit,
				"PROVIDER_UNAVAILABLE",
				"The interviewer could not finish the expired attempt. Retry starting it.",
				true,
			);
		}
	}

	/** Emits one completed utterance for gapless playback, then advances state. */
	private async _speak(
		attemptId: string,
		candidate: User,
		turn: { id: string; text: string },
		emit: InterviewEventEmitter,
	): Promise<void> {
		emit("assistant:turn:start", { turnId: turn.id });
		emit("assistant:subtitle", {
			turnId: turn.id,
			text: turn.text,
			isFinal: true,
		});
		try {
			const audio = await this._textToSpeech.synthesize({
				text: turn.text,
			});
			if (
				audio.bytes.byteLength === 0 ||
				audio.bytes.byteLength > InterviewOrchestratorService._MAX_TTS_BYTES
			) {
				throw new Error("Text-to-speech output violated the server size limit");
			}

			emit("assistant:audio:chunk", {
				turnId: turn.id,
				sequence: 0,
				mimeType: audio.mimeType,
				sampleRateHz: audio.sampleRateHz,
				channels: audio.channels,
				data: audio.bytes,
			});
		} catch (error) {
			this._logger.warn("Text-to-speech failed for an interview turn", error);
			this._emitFailure(
				emit,
				"AUDIO_UNAVAILABLE",
				"Interviewer audio was unavailable; use the subtitle for this turn.",
				true,
			);
		}

		emit("assistant:turn:end", { turnId: turn.id });
		const snapshot = await this._attempts.finishAssistantSpeech(
			attemptId,
			candidate,
		);
		emit("attempt:state", snapshot);
		if (snapshot.state === "COMPLETED") {
			emit("attempt:ended", {
				reason: snapshot.endReason,
				endedAt: snapshot.endedAt,
			});
		}
	}

	/** Generates, validates, persists, and speaks one model-controlled turn. */
	private async _generateAndSpeak(
		attemptId: string,
		candidate: User,
		emit: InterviewEventEmitter,
	): Promise<void> {
		const context = await this._attempts.loadModelContext(attemptId, candidate);
		const pendingTasks = context.tasks.filter((task) => !task.completed);
		const activeTask = pendingTasks[0];
		const nextTask = pendingTasks[1];
		const providerContext = {
			...context,
			// The model needs only the current boundary and the next boundary it may
			// transition into. Persisted server state remains the source of truth.
			tasks: pendingTasks.slice(0, 2),
			transcript: context.transcript.slice(-4),
		};
		let generated: GeneratedInterviewTurn;
		try {
			// The opening deliberately goes through the model so candidates receive
			// a natural, personalized question inside the server-owned topic boundary.
			generated = await this._llm.generateTurn(providerContext);
		} catch (error) {
			if (activeTask && !context.mustEnd) throw error;
			generated = {
				text: context.mustEnd
					? "Thank you for your time. The interview has now reached its time limit."
					: "Thank you for your time. That concludes the interview.",
				actions: [
					{
						type: "end_interview" as const,
						reason: context.mustEnd
							? "Time limit reached"
							: "All topics completed",
					},
				],
			};
		}

		const modelRequestedCompletion = generated.actions.some(
			(action) =>
				action.type === "complete_questions" &&
				activeTask !== undefined &&
				action.questionIds.includes(activeTask.id),
		);
		const completeCurrentTask = Boolean(
			activeTask &&
				!context.mustEnd &&
				(activeTask.turnCount >= 2 ||
					(activeTask.turnCount === 1 && modelRequestedCompletion)),
		);
		const completedQuestionIds =
			completeCurrentTask && activeTask ? [activeTask.id] : [];
		const engagedQuestionId = context.mustEnd
			? null
			: completeCurrentTask
				? (nextTask?.id ?? null)
				: (activeTask?.id ?? null);
		const text = generated.text.trim();
		if (
			text.length === 0 ||
			text.length > InterviewOrchestratorService._MAX_INTERVIEWER_TEXT_LENGTH
		) {
			throw new Error("Interview model returned invalid spoken text");
		}
		// Provider action IDs and end requests never decide state. The server
		// permits completion only after one answer, forces it after one optional
		// follow-up, and closes only at the deadline or final completed topic.
		const endRequested =
			context.mustEnd ||
			activeTask === undefined ||
			(completeCurrentTask && nextTask === undefined);
		const saved = await this._attempts.saveAssistantTurn(attemptId, candidate, {
			text,
			completedQuestionIds,
			engagedQuestionId,
			endRequested,
			forceEnd: context.mustEnd,
		});
		await this._speak(attemptId, candidate, saved, emit);
	}

	/** Starts or resumes the assistant side of an attempt exactly once per process. */
	async start(
		attemptId: string,
		candidate: User,
		emit: InterviewEventEmitter,
	): Promise<void> {
		if (this._runningAttempts.has(attemptId)) return;
		this._runningAttempts.add(attemptId);
		try {
			const result = await this._attempts.start(attemptId, candidate);
			emit("attempt:state", result.snapshot);
			if (!result.shouldRunAssistant) return;

			const lastTurn = result.snapshot.turns.at(-1);
			if (
				lastTurn?.role === "assistant" &&
				(result.snapshot.state === "ASSISTANT_SPEAKING" ||
					result.snapshot.state === "ENDING")
			) {
				await this._speak(attemptId, candidate, lastTurn, emit);
				return;
			}
			await this._generateAndSpeak(attemptId, candidate, emit);
		} catch (error) {
			this._logger.error("Interview start orchestration failed", error);
			this._emitFailure(
				emit,
				"PROVIDER_UNAVAILABLE",
				"The interviewer could not respond. Retry starting the attempt.",
				true,
			);
		} finally {
			this._runningAttempts.delete(attemptId);
			await this._checkDeadlineAfterWork(attemptId, candidate, emit);
		}
	}

	/** Transcribes a completed candidate turn and advances the AI conversation. */
	async processCandidateAudio(
		audio: BufferedCandidateAudio,
		candidate: User,
		emit: InterviewEventEmitter,
	): Promise<void> {
		if (this._runningAttempts.has(audio.attemptId)) {
			this._emitFailure(
				emit,
				"TURN_IN_PROGRESS",
				"Another interview turn is already being processed.",
				true,
			);
			return;
		}

		const claim = await this._attempts.claimCandidateTurn(
			audio.attemptId,
			audio.turnId,
			candidate,
		);
		if (claim.duplicate) return;
		this._runningAttempts.add(audio.attemptId);
		try {
			emit(
				"attempt:state",
				await this._attempts.findSnapshot(audio.attemptId, candidate),
			);
			let transcript: string;
			try {
				transcript = await this._speechToText.transcribe({
					bytes: audio.bytes,
					mimeType: audio.mimeType,
					sampleRateHz: audio.sampleRateHz,
					channels: audio.channels,
				});
			} catch (error) {
				this._logger.warn("Speech-to-text failed for a candidate turn", error);
				const snapshot = await this._attempts.restoreListening(
					audio.attemptId,
					candidate,
				);
				emit("attempt:state", snapshot);
				this._emitFailure(
					emit,
					"TRANSCRIPTION_FAILED",
					"The candidate audio could not be transcribed. Please answer again.",
					true,
				);
				return;
			}
			if (!transcript.trim()) {
				const snapshot = await this._attempts.restoreListening(
					audio.attemptId,
					candidate,
				);
				emit("attempt:state", snapshot);
				this._emitFailure(
					emit,
					"NO_SPEECH",
					"No intelligible speech was detected. Please answer again.",
					true,
				);
				return;
			}
			if (
				transcript.trim().length >
				InterviewOrchestratorService._MAX_TRANSCRIPT_LENGTH
			) {
				const snapshot = await this._attempts.restoreListening(
					audio.attemptId,
					candidate,
				);
				emit("attempt:state", snapshot);
				this._emitFailure(
					emit,
					"TRANSCRIPT_TOO_LONG",
					"The candidate response was too long. Please answer more briefly.",
					false,
				);
				return;
			}

			const saved = await this._attempts.saveCandidateTranscript(
				audio.attemptId,
				audio.turnId,
				transcript.trim(),
				candidate,
			);
			emit("candidate:transcript", {
				turnId: saved.id,
				text: saved.text,
				isFinal: true,
			});
			await this._generateAndSpeak(audio.attemptId, candidate, emit);
		} catch (error) {
			this._logger.error("Candidate turn orchestration failed", error);
			this._emitFailure(
				emit,
				"PROVIDER_UNAVAILABLE",
				"The interviewer could not respond. Retry starting the attempt.",
				true,
			);
		} finally {
			this._runningAttempts.delete(audio.attemptId);
			await this._checkDeadlineAfterWork(audio.attemptId, candidate, emit);
		}
	}

	/** Ends an expired listening attempt through a final model/tool turn. */
	async handleDeadline(
		attemptId: string,
		candidate: User,
		emit: InterviewEventEmitter,
	): Promise<void> {
		if (this._runningAttempts.has(attemptId)) return;
		if (!(await this._attempts.claimDeadline(attemptId, candidate))) return;
		this._runningAttempts.add(attemptId);
		try {
			emit(
				"attempt:state",
				await this._attempts.findSnapshot(attemptId, candidate),
			);
			await this._generateAndSpeak(attemptId, candidate, emit);
		} finally {
			this._runningAttempts.delete(attemptId);
		}
	}
}
