import {
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { User } from "better-auth/types";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	lte,
	max,
	notInArray,
	sql,
} from "drizzle-orm";
import {
	type AppDatabase,
	InjectDatabase,
} from "../../db/database.provider.js";
import {
	attemptQuestionProgress,
	interview,
	interviewAttempt,
	interviewQuestion,
	interviewTurn,
	user,
} from "../../db/schema/index.js";
import type {
	GenerateInterviewTurnInput,
	InterviewTaskContext,
} from "../ai/ai.ports.js";
import type {
	AttemptSnapshot,
	CandidateInterviewHistory,
	CreatorAttemptHistory,
} from "./dto/response.dto.js";

type AttemptRow = typeof interviewAttempt.$inferSelect;

const PROCESSING_RECOVERY_MS = 3 * 60_000;

export type StartAttemptResult = {
	snapshot: AttemptSnapshot;
	shouldRunAssistant: boolean;
};

export type SavedAssistantTurn = {
	id: string;
	text: string;
	shouldEnd: boolean;
	endReason: "AI_COMPLETED" | "TIME_LIMIT" | null;
};

export type CandidateTurnClaim = {
	claimed: boolean;
	duplicate: boolean;
};

@Injectable()
export class InterviewAttemptsService {
	constructor(
		@InjectDatabase()
		private readonly _database: AppDatabase,
	) {}

	/** Converts one persisted attempt row and its public turns to a snapshot. */
	private async _toSnapshot(row: AttemptRow): Promise<AttemptSnapshot> {
		const turns = await this._database
			.select({
				id: interviewTurn.id,
				sequence: interviewTurn.sequence,
				role: interviewTurn.role,
				text: interviewTurn.text,
				createdAt: interviewTurn.createdAt,
			})
			.from(interviewTurn)
			.where(eq(interviewTurn.attemptId, row.id))
			.orderBy(asc(interviewTurn.sequence));

		return {
			id: row.id,
			state: row.state,
			startedAt: row.startedAt?.toISOString() ?? null,
			deadlineAt: row.deadlineAt?.toISOString() ?? null,
			endedAt: row.endedAt?.toISOString() ?? null,
			endReason: row.endReason,
			media: {
				cameraActive: row.cameraActive,
				screenActive: row.screenActive,
				microphoneActive: row.microphoneActive,
			},
			turns: turns.map((turn) => ({
				...turn,
				role: turn.role === "ASSISTANT" ? "assistant" : "candidate",
				createdAt: turn.createdAt.toISOString(),
			})),
		};
	}

	/** Loads one candidate-owned attempt while hiding foreign IDs as missing. */
	private async _findOwnedRow(
		attemptId: string,
		candidateId: string,
	): Promise<AttemptRow> {
		const [row] = await this._database
			.select()
			.from(interviewAttempt)
			.where(
				and(
					eq(interviewAttempt.id, attemptId),
					eq(interviewAttempt.candidateId, candidateId),
				),
			)
			.limit(1);
		if (!row) {
			throw new NotFoundException(
				"Interview attempt does not exist or belongs to another candidate",
			);
		}
		return row;
	}

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

	/** Resumes active work or creates a permitted new attempt for a share link. */
	async createOrResume(
		shareCode: string,
		candidate: User,
	): Promise<AttemptSnapshot> {
		const attemptId = await this._database.transaction(async (transaction) => {
			const [definition] = await transaction
				.select({
					id: interview.id,
					allowMultipleAttempts: interview.allowMultipleAttempts,
				})
				.from(interview)
				.where(eq(interview.shareCode, shareCode))
				.limit(1)
				.for("update");
			if (!definition)
				throw new NotFoundException("Shared interview does not exist");

			const [existing] = await transaction
				.select({ id: interviewAttempt.id, state: interviewAttempt.state })
				.from(interviewAttempt)
				.where(
					and(
						eq(interviewAttempt.interviewId, definition.id),
						eq(interviewAttempt.candidateId, candidate.id),
					),
				)
				.orderBy(desc(interviewAttempt.createdAt))
				.limit(1);
			const existingIsTerminal =
				existing?.state === "COMPLETED" || existing?.state === "FAILED";
			if (existing && !existingIsTerminal) return existing.id;
			if (existing && !definition.allowMultipleAttempts) {
				throw new ConflictException(
					"This interview already has a finished attempt",
				);
			}

			const [created] = await transaction
				.insert(interviewAttempt)
				.values({ interviewId: definition.id, candidateId: candidate.id })
				.onConflictDoNothing()
				.returning({ id: interviewAttempt.id });
			if (!created) {
				const [concurrent] = await transaction
					.select({ id: interviewAttempt.id })
					.from(interviewAttempt)
					.where(
						and(
							eq(interviewAttempt.interviewId, definition.id),
							eq(interviewAttempt.candidateId, candidate.id),
							notInArray(interviewAttempt.state, ["COMPLETED", "FAILED"]),
						),
					)
					.orderBy(desc(interviewAttempt.createdAt))
					.limit(1);
				if (concurrent) return concurrent.id;
				throw new ConflictException("Attempt could not be created");
			}

			const questions = await transaction
				.select({ id: interviewQuestion.id })
				.from(interviewQuestion)
				.where(eq(interviewQuestion.interviewId, definition.id));
			await transaction.insert(attemptQuestionProgress).values(
				questions.map((question) => ({
					attemptId: created.id,
					questionId: question.id,
				})),
			);
			return created.id;
		});

		return this.findSnapshot(attemptId, candidate);
	}

	/** Lists safe participant attempt metadata for one creator-owned interview. */
	async findAllForCreator(
		interviewId: string,
		creator: User,
	): Promise<CreatorAttemptHistory[]> {
		const [owned] = await this._database
			.select({ id: interview.id })
			.from(interview)
			.where(
				and(
					eq(interview.id, interviewId),
					eq(interview.createdById, creator.id),
				),
			)
			.limit(1);
		if (!owned) {
			throw new NotFoundException(
				"Interview does not exist or is not owned by the current user",
			);
		}

		const rows = await this._database
			.select({
				id: interviewAttempt.id,
				candidateId: user.id,
				candidateName: user.name,
				candidateEmail: user.email,
				state: interviewAttempt.state,
				endReason: interviewAttempt.endReason,
				createdAt: interviewAttempt.createdAt,
				startedAt: interviewAttempt.startedAt,
				deadlineAt: interviewAttempt.deadlineAt,
				endedAt: interviewAttempt.endedAt,
				completedQuestionCount: sql<number>`count(${attemptQuestionProgress.questionId}) filter (where ${attemptQuestionProgress.state} = 'COMPLETED')`,
				totalQuestionCount: count(attemptQuestionProgress.questionId),
			})
			.from(interviewAttempt)
			.innerJoin(user, eq(user.id, interviewAttempt.candidateId))
			.leftJoin(
				attemptQuestionProgress,
				eq(attemptQuestionProgress.attemptId, interviewAttempt.id),
			)
			.where(eq(interviewAttempt.interviewId, interviewId))
			.groupBy(interviewAttempt.id, user.id)
			.orderBy(desc(interviewAttempt.createdAt));

		return rows.map((row) => ({
			id: row.id,
			candidate: {
				id: row.candidateId,
				name: row.candidateName,
				email: row.candidateEmail,
			},
			state: row.state,
			endReason: row.endReason,
			createdAt: row.createdAt.toISOString(),
			startedAt: row.startedAt?.toISOString() ?? null,
			deadlineAt: row.deadlineAt?.toISOString() ?? null,
			endedAt: row.endedAt?.toISOString() ?? null,
			completedQuestionCount: Number(row.completedQuestionCount),
			totalQuestionCount: Number(row.totalQuestionCount),
		}));
	}

	/** Returns every candidate attempt grouped under its shared interview. */
	async findAllForCandidate(
		candidate: User,
	): Promise<CandidateInterviewHistory[]> {
		const rows = await this._database
			.select({
				interviewId: interview.id,
				interviewTitle: interview.title,
				interviewDescription: interview.description,
				shareCode: interview.shareCode,
				durationMinutes: interview.durationMinutes,
				allowMultipleAttempts: interview.allowMultipleAttempts,
				attemptId: interviewAttempt.id,
				state: interviewAttempt.state,
				endReason: interviewAttempt.endReason,
				createdAt: interviewAttempt.createdAt,
				startedAt: interviewAttempt.startedAt,
				deadlineAt: interviewAttempt.deadlineAt,
				endedAt: interviewAttempt.endedAt,
				completedQuestionCount: sql<number>`count(${attemptQuestionProgress.questionId}) filter (where ${attemptQuestionProgress.state} = 'COMPLETED')`,
				totalQuestionCount: count(attemptQuestionProgress.questionId),
			})
			.from(interviewAttempt)
			.innerJoin(interview, eq(interview.id, interviewAttempt.interviewId))
			.leftJoin(
				attemptQuestionProgress,
				eq(attemptQuestionProgress.attemptId, interviewAttempt.id),
			)
			.where(eq(interviewAttempt.candidateId, candidate.id))
			.groupBy(interviewAttempt.id, interview.id)
			.orderBy(desc(interviewAttempt.createdAt));

		const histories = new Map<string, CandidateInterviewHistory>();
		for (const row of rows) {
			let history = histories.get(row.interviewId);
			if (!history) {
				history = {
					interview: {
						id: row.interviewId,
						title: row.interviewTitle,
						description: row.interviewDescription,
						shareCode: row.shareCode,
						durationMinutes: row.durationMinutes,
						allowMultipleAttempts: row.allowMultipleAttempts,
					},
					attempts: [],
				};
				histories.set(row.interviewId, history);
			}
			history.attempts.push({
				id: row.attemptId,
				state: row.state,
				endReason: row.endReason,
				createdAt: row.createdAt.toISOString(),
				startedAt: row.startedAt?.toISOString() ?? null,
				deadlineAt: row.deadlineAt?.toISOString() ?? null,
				endedAt: row.endedAt?.toISOString() ?? null,
				completedQuestionCount: Number(row.completedQuestionCount),
				totalQuestionCount: Number(row.totalQuestionCount),
			});
		}
		return [...histories.values()];
	}

	/** Returns a reconnect-safe candidate snapshot with text transcript only. */
	async findSnapshot(
		attemptId: string,
		candidate: User,
	): Promise<AttemptSnapshot> {
		return this._toSnapshot(await this._findOwnedRow(attemptId, candidate.id));
	}

	/** Starts, resumes, or safely recovers one candidate attempt. */
	async start(attemptId: string, candidate: User): Promise<StartAttemptResult> {
		await this._database.transaction(async (transaction) => {
			const [row] = await transaction
				.select({
					state: interviewAttempt.state,
					durationMinutes: interview.durationMinutes,
					updatedAt: interviewAttempt.updatedAt,
				})
				.from(interviewAttempt)
				.innerJoin(interview, eq(interview.id, interviewAttempt.interviewId))
				.where(
					and(
						eq(interviewAttempt.id, attemptId),
						eq(interviewAttempt.candidateId, candidate.id),
					),
				)
				.for("update");
			if (!row) {
				throw new NotFoundException(
					"Interview attempt does not exist or belongs to another candidate",
				);
			}
			if (row.state === "COMPLETED" || row.state === "FAILED") {
				throw new ConflictException("Interview attempt cannot be started");
			}

			if (row.state === "READY") {
				const startedAt = new Date();
				const deadlineAt = new Date(
					startedAt.getTime() + row.durationMinutes * 60_000,
				);
				await transaction
					.update(interviewAttempt)
					.set({
						state: "ASSISTANT_SPEAKING",
						startedAt,
						deadlineAt,
						version: sql`${interviewAttempt.version} + 1`,
					})
					.where(eq(interviewAttempt.id, attemptId));
			}
			const processingIsStale =
				row.state === "PROCESSING" &&
				row.updatedAt.getTime() <= Date.now() - PROCESSING_RECOVERY_MS;
			if (processingIsStale) {
				await transaction
					.update(interviewAttempt)
					.set({
						state: "ASSISTANT_SPEAKING",
						version: sql`${interviewAttempt.version} + 1`,
					})
					.where(eq(interviewAttempt.id, attemptId));
			}
		});

		const snapshot = await this.findSnapshot(attemptId, candidate);
		return {
			snapshot,
			shouldRunAssistant:
				snapshot.state === "ASSISTANT_SPEAKING" || snapshot.state === "ENDING",
		};
	}

	/** Ensures microphone input is accepted only during the candidate turn. */
	async assertListening(attemptId: string, candidate: User): Promise<void> {
		const row = await this._findOwnedRow(attemptId, candidate.id);
		if (row.state !== "LISTENING") {
			throw new ConflictException("The interview is not listening for audio");
		}
	}

	/** Atomically claims a candidate audio turn and detects a replayed turn ID. */
	async claimCandidateTurn(
		attemptId: string,
		clientTurnId: string,
		candidate: User,
	): Promise<CandidateTurnClaim> {
		const [duplicate] = await this._database
			.select({ id: interviewTurn.id })
			.from(interviewTurn)
			.where(
				and(
					eq(interviewTurn.attemptId, attemptId),
					eq(interviewTurn.clientTurnId, clientTurnId),
				),
			)
			.limit(1);
		if (duplicate) return { claimed: false, duplicate: true };

		const [claimed] = await this._database
			.update(interviewAttempt)
			.set({
				state: "PROCESSING",
				microphoneActive: false,
				version: sql`${interviewAttempt.version} + 1`,
			})
			.where(
				and(
					eq(interviewAttempt.id, attemptId),
					eq(interviewAttempt.candidateId, candidate.id),
					eq(interviewAttempt.state, "LISTENING"),
					isNotNull(interviewAttempt.deadlineAt),
					gt(interviewAttempt.deadlineAt, new Date()),
				),
			)
			.returning({ id: interviewAttempt.id });
		if (!claimed) {
			await this._findOwnedRow(attemptId, candidate.id);
			throw new ConflictException(
				"Candidate turn is unavailable or already being processed",
			);
		}
		return { claimed: true, duplicate: false };
	}

	/** Restores the candidate turn when no intelligible transcript was produced. */
	async restoreListening(
		attemptId: string,
		candidate: User,
	): Promise<AttemptSnapshot> {
		await this._database
			.update(interviewAttempt)
			.set({
				state: "LISTENING",
				version: sql`${interviewAttempt.version} + 1`,
			})
			.where(
				and(
					eq(interviewAttempt.id, attemptId),
					eq(interviewAttempt.candidateId, candidate.id),
					eq(interviewAttempt.state, "PROCESSING"),
				),
			);
		return this.findSnapshot(attemptId, candidate);
	}

	/** Persists one idempotent candidate transcript and prepares the assistant. */
	async saveCandidateTranscript(
		attemptId: string,
		clientTurnId: string,
		text: string,
		candidate: User,
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
					role: "CANDIDATE",
					text,
					clientTurnId,
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
			candidate: { name: row.candidateName },
			tasks: taskRows.map(
				(task): InterviewTaskContext => ({
					id: task.id,
					position: task.position,
					title: task.title,
					prompt: task.prompt,
					objective: task.objective,
					followUpGuidance: task.followUpGuidance,
					completed: task.progress === "COMPLETED",
				}),
			),
			transcript: transcriptRows.map((turn) => ({
				role: turn.role === "ASSISTANT" ? "assistant" : "candidate",
				text: turn.text,
			})),
			remainingSeconds,
			mustEnd: remainingSeconds === 0,
		};
	}

	/** Persists one assistant utterance, progress tools, and its next durable state. */
	async saveAssistantTurn(
		attemptId: string,
		candidate: User,
		input: {
			text: string;
			completedQuestionIds: string[];
			endRequested: boolean;
			forceEnd: boolean;
		},
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

			if (input.completedQuestionIds.length > 0) {
				await transaction
					.update(attemptQuestionProgress)
					.set({ state: "COMPLETED", completedAt: new Date() })
					.where(
						and(
							eq(attemptQuestionProgress.attemptId, attemptId),
							inArray(
								attemptQuestionProgress.questionId,
								input.completedQuestionIds,
							),
						),
					);
			}

			const [pending] = await transaction
				.select({ count: count() })
				.from(attemptQuestionProgress)
				.where(
					and(
						eq(attemptQuestionProgress.attemptId, attemptId),
						eq(attemptQuestionProgress.state, "PENDING"),
					),
				);
			const deadlineReached =
				row.deadlineAt !== null && row.deadlineAt.getTime() <= Date.now();
			const shouldEnd =
				input.forceEnd ||
				deadlineReached ||
				(input.endRequested && Number(pending?.count ?? 0) === 0);
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
					role: "ASSISTANT",
					text: input.text,
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

	/** Advances from assistant audio to listening or final completion. */
	async finishAssistantSpeech(
		attemptId: string,
		candidate: User,
	): Promise<AttemptSnapshot> {
		await this._database
			.update(interviewAttempt)
			.set({
				state: sql`case when ${interviewAttempt.state} = 'ENDING' then 'COMPLETED'::interview_attempt_state else 'LISTENING'::interview_attempt_state end`,
				endedAt: sql`case when ${interviewAttempt.state} = 'ENDING' then now() else ${interviewAttempt.endedAt} end`,
				cameraActive: sql`case when ${interviewAttempt.state} = 'ENDING' then false else ${interviewAttempt.cameraActive} end`,
				screenActive: sql`case when ${interviewAttempt.state} = 'ENDING' then false else ${interviewAttempt.screenActive} end`,
				microphoneActive: sql`case when ${interviewAttempt.state} = 'ENDING' then false else ${interviewAttempt.microphoneActive} end`,
				version: sql`${interviewAttempt.version} + 1`,
			})
			.where(
				and(
					eq(interviewAttempt.id, attemptId),
					eq(interviewAttempt.candidateId, candidate.id),
					inArray(interviewAttempt.state, ["ASSISTANT_SPEAKING", "ENDING"]),
				),
			);
		return this.findSnapshot(attemptId, candidate);
	}

	/** Claims any expired nonterminal work state for a final model turn. */
	async claimDeadline(attemptId: string, candidate: User): Promise<boolean> {
		const [claimed] = await this._database
			.update(interviewAttempt)
			.set({
				state: "PROCESSING",
				version: sql`${interviewAttempt.version} + 1`,
			})
			.where(
				and(
					eq(interviewAttempt.id, attemptId),
					eq(interviewAttempt.candidateId, candidate.id),
					inArray(interviewAttempt.state, [
						"ASSISTANT_SPEAKING",
						"LISTENING",
						"PROCESSING",
					]),
					isNotNull(interviewAttempt.deadlineAt),
					lte(interviewAttempt.deadlineAt, new Date()),
				),
			)
			.returning({ id: interviewAttempt.id });
		return claimed !== undefined;
	}

	/** Persists media status flags but never persists media bytes. */
	async updateMedia(
		attemptId: string,
		candidate: User,
		media: {
			cameraActive: boolean;
			screenActive: boolean;
			microphoneActive: boolean;
		},
	): Promise<AttemptSnapshot> {
		const [updated] = await this._database
			.update(interviewAttempt)
			.set({ ...media, version: sql`${interviewAttempt.version} + 1` })
			.where(
				and(
					eq(interviewAttempt.id, attemptId),
					eq(interviewAttempt.candidateId, candidate.id),
					notInArray(interviewAttempt.state, ["COMPLETED", "FAILED"]),
				),
			)
			.returning({ id: interviewAttempt.id });
		if (!updated) {
			await this._findOwnedRow(attemptId, candidate.id);
			throw new ConflictException("Finished interview media cannot be changed");
		}
		return this.findSnapshot(attemptId, candidate);
	}
}
