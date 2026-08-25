import {
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { User } from "better-auth/types";
import {
	and,
	asc,
	eq,
	gt,
	inArray,
	isNotNull,
	lte,
	notInArray,
	sql,
} from "drizzle-orm";
import { type AppDatabase, InjectDatabase } from "#/db/database.provider.js";
import {
	interview,
	interviewAttempt,
	interviewTurn,
} from "#/db/schema/index.js";
import type { AttemptSnapshot } from "./dto/response.dto.js";

type AttemptRow = typeof interviewAttempt.$inferSelect;

const PROCESSING_RECOVERY_MS = 3 * 60_000;

export type StartAttemptResult = {
	snapshot: AttemptSnapshot;
	shouldRunAssistant: boolean;
};

export type CandidateTurnClaim = {
	claimed: boolean;
	duplicate: boolean;
};

/** Owns candidate-authorized attempt state transitions and snapshots. */
@Injectable()
export class InterviewAttemptStateService {
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
				startedAt: interviewTurn.startedAt,
				endedAt: interviewTurn.endedAt,
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
				startedAt: turn.startedAt?.toISOString() ?? null,
				endedAt: turn.endedAt?.toISOString() ?? null,
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

	/** Ends an attempt after a client-side integrity rule reports a violation. */
	async failForIntegrity(
		attemptId: string,
		candidate: User,
	): Promise<AttemptSnapshot> {
		const [updated] = await this._database
			.update(interviewAttempt)
			.set({
				state: "FAILED",
				endedAt: new Date(),
				cameraActive: false,
				screenActive: false,
				microphoneActive: false,
				version: sql`${interviewAttempt.version} + 1`,
			})
			.where(
				and(
					eq(interviewAttempt.id, attemptId),
					eq(interviewAttempt.candidateId, candidate.id),
					notInArray(interviewAttempt.state, ["COMPLETED", "FAILED"]),
				),
			)
			.returning({ id: interviewAttempt.id });
		if (!updated) await this._findOwnedRow(attemptId, candidate.id);
		return this.findSnapshot(attemptId, candidate);
	}
}
