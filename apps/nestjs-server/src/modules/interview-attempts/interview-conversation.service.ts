import { createHash } from "node:crypto";
import type { AttemptEndReason } from "@interview-desk/validations";
import {
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { User } from "better-auth/types";
import { and, asc, count, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { type AppDatabase, InjectDatabase } from "#/db/database.provider.js";
import {
	attemptQuestionProgress,
	interview,
	interviewAttempt,
	interviewQuestion,
	interviewTurn,
	user,
} from "#/db/schema/index.js";
import type {
	GenerateInterviewTurnInput,
	InterviewTaskContext,
} from "#/modules/ai/llm/llm.port.js";
import { TIME_LIMIT_CLOSING_TEXT } from "./interview-attempt.constants.js";

export type SavedAssistantTurn = {
	id: string;
	text: string;
	shouldEnd: boolean;
	endReason: AttemptEndReason | null;
};

export type SaveAssistantTurnInput = {
	text: string;
	completedQuestionIds: string[];
	engagedQuestionId: string | null;
	endRequested: boolean;
	forceEnd: boolean;
};

export type CompletedTurnTiming = {
	startedAt: Date;
	endedAt: Date;
};

/** Owns durable conversation turns, question progress, and model context. */
@Injectable()
export class InterviewConversationService {
	constructor(
		@InjectDatabase()
		private readonly _database: AppDatabase,
	) {}

	/** Finds the next monotonic transcript sequence inside a locked transaction. */
	private async _nextSequence(
		transaction: Parameters<Parameters<AppDatabase["transaction"]>[0]>[0],
		attemptId: string,
	): Promise<number> {
		const [result] = await transaction
			.select({ sequence: max(interviewTurn.sequence) })
			.from(interviewTurn)
			.where(eq(interviewTurn.attemptId, attemptId));
		return Number(result?.sequence ?? 0) + 1;
	}

	/** Persists one idempotent candidate transcript and prepares the assistant. */
	async saveCandidateTranscript(
		attemptId: string,
		clientTurnId: string,
		text: string,
		candidate: User,
		timing: CompletedTurnTiming,
	): Promise<{ id: string; text: string }> {
		return this._database.transaction(async (transaction) => {
			const [row] = await transaction
				.select({ state: interviewAttempt.state })
				.from(interviewAttempt)
				.where(
					and(
						eq(interviewAttempt.id, attemptId),
						eq(interviewAttempt.candidateId, candidate.id),
					),
				)
				.for("update");
			if (!row) throw new NotFoundException("Interview attempt does not exist");

			const [existing] = await transaction
				.select({ id: interviewTurn.id, text: interviewTurn.text })
				.from(interviewTurn)
				.where(
					and(
						eq(interviewTurn.attemptId, attemptId),
						eq(interviewTurn.clientTurnId, clientTurnId),
					),
				)
				.limit(1);
			if (existing) return existing;
			if (row.state !== "PROCESSING") {
				throw new ConflictException("Candidate transcript is not expected now");
			}

			const [saved] = await transaction
				.insert(interviewTurn)
				.values({
					attemptId,
					sequence: await this._nextSequence(transaction, attemptId),
					role: "candidate",
					text,
					clientTurnId,
					startedAt: timing.startedAt,
					endedAt: timing.endedAt,
				})
				.returning({ id: interviewTurn.id, text: interviewTurn.text });
			if (!saved)
				throw new ConflictException("Candidate transcript was not saved");
			await transaction
				.update(interviewAttempt)
				.set({
					state: "ASSISTANT_SPEAKING",
					version: sql`${interviewAttempt.version} + 1`,
				})
				.where(eq(interviewAttempt.id, attemptId));
			return saved;
		});
	}

	/** Loads only server-owned context needed for the next model turn. */
	async loadModelContext(
		attemptId: string,
		candidate: User,
	): Promise<GenerateInterviewTurnInput> {
		const [row] = await this._database
			.select({
				state: interviewAttempt.state,
				deadlineAt: interviewAttempt.deadlineAt,
				interviewTitle: interview.title,
				interviewDescription: interview.description,
				candidateName: user.name,
			})
			.from(interviewAttempt)
			.innerJoin(interview, eq(interview.id, interviewAttempt.interviewId))
			.innerJoin(user, eq(user.id, interviewAttempt.candidateId))
			.where(
				and(
					eq(interviewAttempt.id, attemptId),
					eq(interviewAttempt.candidateId, candidate.id),
					inArray(interviewAttempt.state, ["ASSISTANT_SPEAKING", "PROCESSING"]),
				),
			)
			.limit(1);
		if (!row)
			throw new ConflictException("Assistant turn cannot be generated now");

		const taskRows = await this._database
			.select({
				id: interviewQuestion.id,
				position: interviewQuestion.position,
				title: interviewQuestion.title,
				prompt: interviewQuestion.prompt,
				objective: interviewQuestion.objective,
				followUpGuidance: interviewQuestion.followUpGuidance,
				progress: attemptQuestionProgress.state,
				turnCount: attemptQuestionProgress.turnCount,
			})
			.from(attemptQuestionProgress)
			.innerJoin(
				interviewQuestion,
				eq(interviewQuestion.id, attemptQuestionProgress.questionId),
			)
			.where(eq(attemptQuestionProgress.attemptId, attemptId))
			.orderBy(asc(interviewQuestion.position));
		const transcriptRows = await this._database
			.select({ role: interviewTurn.role, text: interviewTurn.text })
			.from(interviewTurn)
			.where(eq(interviewTurn.attemptId, attemptId))
			.orderBy(asc(interviewTurn.sequence));
		const remainingSeconds = row.deadlineAt
			? Math.max(0, Math.ceil((row.deadlineAt.getTime() - Date.now()) / 1_000))
			: 0;

		return {
			interview: {
				title: row.interviewTitle,
				description: row.interviewDescription,
			},
			candidate: {
				name: row.candidateName,
				// The LLM receives only this opaque, attempt-scoped key. It cannot
				// recover or expose the candidate/attempt UUIDs used to derive it.
				variationKey: createHash("sha256")
					.update(`${attemptId}:${candidate.id}`)
					.digest("hex")
					.slice(0, 32),
			},
			tasks: taskRows.map(
				(task): InterviewTaskContext => ({
					id: task.id,
					position: task.position,
					title: task.title,
					prompt: task.prompt,
					objective: task.objective,
					followUpGuidance: task.followUpGuidance,
					completed: task.progress === "COMPLETED",
					turnCount: task.turnCount,
				}),
			),
			transcript: transcriptRows,
			remainingSeconds,
			mustEnd: remainingSeconds === 0,
		};
	}

	/** Persists one assistant utterance, progress tools, and its next durable state. */
	async saveAssistantTurn(
		attemptId: string,
		candidate: User,
		input: SaveAssistantTurnInput,
	): Promise<SavedAssistantTurn> {
		return this._database.transaction(async (transaction) => {
			const [row] = await transaction
				.select({
					state: interviewAttempt.state,
					deadlineAt: interviewAttempt.deadlineAt,
				})
				.from(interviewAttempt)
				.where(
					and(
						eq(interviewAttempt.id, attemptId),
						eq(interviewAttempt.candidateId, candidate.id),
					),
				)
				.for("update");
			if (!row) throw new NotFoundException("Interview attempt does not exist");
			if (row.state !== "ASSISTANT_SPEAKING" && row.state !== "PROCESSING") {
				throw new ConflictException("Assistant transcript is not expected now");
			}
			const deadlineReached =
				row.deadlineAt !== null && row.deadlineAt.getTime() <= Date.now();

			// A generation may finish after its deadline. In that race, discard the
			// model move and do not mutate topic progress; the persisted/spoken turn
			// is the server-owned time-limit close below.
			const completedQuestionIds = deadlineReached
				? []
				: [...new Set(input.completedQuestionIds)];
			if (completedQuestionIds.length > 0) {
				const completed = await transaction
					.update(attemptQuestionProgress)
					.set({ state: "COMPLETED", completedAt: new Date() })
					.where(
						and(
							eq(attemptQuestionProgress.attemptId, attemptId),
							eq(attemptQuestionProgress.state, "PENDING"),
							inArray(attemptQuestionProgress.questionId, completedQuestionIds),
						),
					)
					.returning({ questionId: attemptQuestionProgress.questionId });
				if (completed.length !== completedQuestionIds.length) {
					throw new ConflictException(
						"Interview topic progress changed before it could be completed",
					);
				}
			}

			if (!deadlineReached && input.engagedQuestionId) {
				const [engaged] = await transaction
					.update(attemptQuestionProgress)
					.set({
						turnCount: sql`${attemptQuestionProgress.turnCount} + 1`,
					})
					.where(
						and(
							eq(attemptQuestionProgress.attemptId, attemptId),
							eq(attemptQuestionProgress.questionId, input.engagedQuestionId),
							eq(attemptQuestionProgress.state, "PENDING"),
						),
					)
					.returning({ questionId: attemptQuestionProgress.questionId });
				if (!engaged) {
					throw new ConflictException(
						"Interview topic progress changed before the turn was saved",
					);
				}
			}

			let pendingCount = 0;
			if (!deadlineReached) {
				const [pending] = await transaction
					.select({ count: count() })
					.from(attemptQuestionProgress)
					.where(
						and(
							eq(attemptQuestionProgress.attemptId, attemptId),
							eq(attemptQuestionProgress.state, "PENDING"),
						),
					);
				pendingCount = Number(pending?.count ?? 0);
			}
			const shouldEnd =
				input.forceEnd ||
				deadlineReached ||
				(input.endRequested && pendingCount === 0);
			const endReason = shouldEnd
				? input.forceEnd || deadlineReached
					? "TIME_LIMIT"
					: "AI_COMPLETED"
				: null;
			const [saved] = await transaction
				.insert(interviewTurn)
				.values({
					attemptId,
					sequence: await this._nextSequence(transaction, attemptId),
					role: "assistant",
					text: deadlineReached ? TIME_LIMIT_CLOSING_TEXT : input.text,
					startedAt: new Date(),
				})
				.returning({ id: interviewTurn.id, text: interviewTurn.text });
			if (!saved)
				throw new ConflictException("Assistant transcript was not saved");

			await transaction
				.update(interviewAttempt)
				.set({
					state: shouldEnd ? "ENDING" : "ASSISTANT_SPEAKING",
					endReason,
					version: sql`${interviewAttempt.version} + 1`,
				})
				.where(eq(interviewAttempt.id, attemptId));
			return { ...saved, shouldEnd, endReason };
		});
	}

	/** Records when the server finished emitting an assistant utterance. */
	async finishAssistantTurn(attemptId: string, turnId: string): Promise<void> {
		await this._database
			.update(interviewTurn)
			.set({ endedAt: new Date() })
			.where(
				and(
					eq(interviewTurn.id, turnId),
					eq(interviewTurn.attemptId, attemptId),
					eq(interviewTurn.role, "assistant"),
					isNull(interviewTurn.endedAt),
				),
			);
	}
}
