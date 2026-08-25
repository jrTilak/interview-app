import {
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { User } from "better-auth/types";
import { and, count, desc, eq, notInArray, sql } from "drizzle-orm";
import { type AppDatabase, InjectDatabase } from "#src/db/database.provider.js";
import {
	attemptQuestionProgress,
	interview,
	interviewAttempt,
	interviewQuestion,
	user,
} from "#src/db/schema/index.js";
import type {
	AttemptSnapshot,
	CandidateInterviewHistory,
	CreatorAttemptHistory,
} from "./dto/response.dto.js";
import { InterviewAttemptStateService } from "./interview-attempt-state.service.js";

/** Creates attempts and serves their creator/candidate history views. */
@Injectable()
export class InterviewAttemptsService {
	constructor(
		@InjectDatabase()
		private readonly _database: AppDatabase,
		private readonly _state: InterviewAttemptStateService,
	) {}

	/** Resumes active work or creates a permitted attempt for a public interview. */
	async createOrResume(
		interviewId: string,
		candidate: User,
	): Promise<AttemptSnapshot> {
		const attemptId = await this._database.transaction(async (transaction) => {
			const [definition] = await transaction
				.select({
					id: interview.id,
					allowMultipleAttempts: interview.allowMultipleAttempts,
				})
				.from(interview)
				.where(and(eq(interview.id, interviewId), eq(interview.isPublic, true)))
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

		return this._state.findSnapshot(attemptId, candidate);
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

	/** Delegates candidate snapshot reads to the lifecycle service. */
	async findSnapshot(
		attemptId: string,
		candidate: User,
	): Promise<AttemptSnapshot> {
		return this._state.findSnapshot(attemptId, candidate);
	}
}
