import { Inject, Injectable, Logger } from "@nestjs/common";
import type { User } from "better-auth/types";
import {
	type GeneratedInterviewTurn,
	INTERVIEW_LLM,
	type InterviewLlmPort,
} from "#src/modules/ai/llm/llm.port.js";
import {
	SPEECH_TO_TEXT,
	type SpeechToTextPort,
} from "#src/modules/ai/stt/stt.port.js";
import {
	TEXT_TO_SPEECH,
	type TextToSpeechPort,
} from "#src/modules/ai/tts/tts.port.js";
import type { AttemptSnapshot } from "./dto/response.dto.js";
import { TIME_LIMIT_CLOSING_TEXT } from "./interview-attempt.constants.js";
import { InterviewAttemptStateService } from "./interview-attempt-state.service.js";
import { InterviewConversationService } from "./interview-conversation.service.js";
import type {
	BufferedCandidateAudio,
	InterviewEventEmitter,
} from "./realtime/interview-realtime.protocol.js";

@Injectable()
export class InterviewOrchestratorService {
	private readonly _logger = new Logger(InterviewOrchestratorService.name);
	private readonly _runningAttempts = new Set<string>();

	constructor(
		private readonly _state: InterviewAttemptStateService,
		private readonly _conversation: InterviewConversationService,
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
			const audio = await this._textToSpeech.synthesize({ text: turn.text });

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
		await this._conversation.finishAssistantTurn(attemptId, turn.id);
		const snapshot = await this._state.finishAssistantSpeech(
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

	/** Generates, persists, and speaks one model-controlled turn. */
	private async _generateAndSpeak(
		attemptId: string,
		candidate: User,
		emit: InterviewEventEmitter,
	): Promise<void> {
		const context = await this._conversation.loadModelContext(
			attemptId,
			candidate,
		);
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
					? TIME_LIMIT_CLOSING_TEXT
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
		// Provider action IDs and end requests never decide state. The server
		// permits completion only after one answer, forces it after one optional
		// follow-up, and closes only at the deadline or final completed topic.
		const endRequested =
			context.mustEnd ||
			activeTask === undefined ||
			(completeCurrentTask && nextTask === undefined);
		const saved = await this._conversation.saveAssistantTurn(
			attemptId,
			candidate,
			{
				text: generated.text,
				completedQuestionIds,
				engagedQuestionId,
				endRequested,
				forceEnd: context.mustEnd,
			},
		);
		await this._speak(attemptId, candidate, saved, emit);
	}

	/** Runs the prepared assistant side of an attempt exactly once per process. */
	async runAssistant(
		attemptId: string,
		candidate: User,
		snapshot: AttemptSnapshot,
		emit: InterviewEventEmitter,
	): Promise<void> {
		if (this._runningAttempts.has(attemptId)) return;
		this._runningAttempts.add(attemptId);
		try {
			const lastTurn = snapshot.turns.at(-1);
			if (
				lastTurn?.role === "assistant" &&
				(snapshot.state === "ASSISTANT_SPEAKING" || snapshot.state === "ENDING")
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

		const claim = await this._state.claimCandidateTurn(
			audio.attemptId,
			audio.turnId,
			candidate,
		);
		if (claim.duplicate) return;
		this._runningAttempts.add(audio.attemptId);
		try {
			emit(
				"attempt:state",
				await this._state.findSnapshot(audio.attemptId, candidate),
			);
			let transcript: string;
			try {
				transcript = (
					await this._speechToText.transcribe({
						bytes: audio.bytes,
						mimeType: audio.mimeType,
						sampleRateHz: audio.sampleRateHz,
						channels: audio.channels,
					})
				).trim();
			} catch (error) {
				this._logger.warn("Speech-to-text failed for a candidate turn", error);
				const snapshot = await this._state.restoreListening(
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
			if (!transcript) {
				const snapshot = await this._state.restoreListening(
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
			const saved = await this._conversation.saveCandidateTranscript(
				audio.attemptId,
				audio.turnId,
				transcript,
				candidate,
				{ startedAt: audio.startedAt, endedAt: audio.endedAt },
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
		if (!(await this._state.claimDeadline(attemptId, candidate))) return;
		this._runningAttempts.add(attemptId);
		try {
			emit(
				"attempt:state",
				await this._state.findSnapshot(attemptId, candidate),
			);
			await this._generateAndSpeak(attemptId, candidate, emit);
		} finally {
			this._runningAttempts.delete(attemptId);
		}
	}
}
