import {
	ATTEMPT_END_REASONS,
	ATTEMPT_STATES,
	INTERVIEW_TURN_ROLES,
} from "@interview-desk/validations";
import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { baseTable } from "./base-table.js";
import { user } from "./better-auth.js";
import { interview, interviewQuestion } from "./interview.js";

export const attemptState = pgEnum("interview_attempt_state", ATTEMPT_STATES);

export const attemptEndReason = pgEnum(
	"interview_attempt_end_reason",
	ATTEMPT_END_REASONS,
);

export const questionProgressState = pgEnum("question_progress_state", [
	"PENDING",
	"COMPLETED",
]);

export const turnRole = pgEnum("interview_turn_role", INTERVIEW_TURN_ROLES);

/**
 * One candidate's run through an interview.
 *
 * This row owns the attempt lifecycle, overall timing, and current media state.
 * Question progress and conversation history are stored in their own tables.
 */
export const interviewAttempt = pgTable(
	"interview_attempt",
	{
		...baseTable,
		interviewId: uuid("interview_id")
			.notNull()
			.references(() => interview.id, { onDelete: "cascade" }),
		candidateId: uuid("candidate_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		state: attemptState("state").notNull().default("READY"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		deadlineAt: timestamp("deadline_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		endReason: attemptEndReason("end_reason"),
		// Monotonically increases whenever mutable attempt state changes.
		version: integer("version").notNull().default(0),
		// Current device state only; media activity history is not stored here.
		cameraActive: boolean("camera_active").notNull().default(false),
		screenActive: boolean("screen_active").notNull().default(false),
		microphoneActive: boolean("microphone_active").notNull().default(false),
	},
	(table) => [
		uniqueIndex("interview_attempt_active_candidate_unique")
			.on(table.interviewId, table.candidateId)
			.where(
				sql`${table.state} not in ('COMPLETED'::interview_attempt_state, 'FAILED'::interview_attempt_state)`,
			),
		index("interview_attempt_candidate_idx").on(
			table.candidateId,
			table.createdAt,
		),
	],
);

/**
 * Server-owned progress for each question within one attempt.
 *
 * These rows track coverage of the interview plan; they are not conversation
 * history and do not change the source interview questions.
 */
export const attemptQuestionProgress = pgTable(
	"attempt_question_progress",
	{
		attemptId: uuid("attempt_id")
			.notNull()
			.references(() => interviewAttempt.id, { onDelete: "cascade" }),
		questionId: uuid("question_id")
			.notNull()
			.references(() => interviewQuestion.id, { onDelete: "cascade" }),
		state: questionProgressState("state").notNull().default("PENDING"),
		// Number of assistant turns that engaged this question.
		turnCount: integer("turn_count").notNull().default(0),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [
		primaryKey({ columns: [table.attemptId, table.questionId] }),
		index("attempt_question_question_idx").on(table.questionId),
		check("attempt_question_turn_count_check", sql`${table.turnCount} >= 0`),
	],
);

/**
 * Durable, ordered conversation history for an interview attempt.
 *
 * Each row is one assistant or candidate utterance. `createdAt` records when
 * the row was persisted, while `startedAt` and `endedAt` capture the
 * server-observed utterance window. Audio bytes are intentionally not stored.
 */
export const interviewTurn = pgTable(
	"interview_turn",
	{
		...baseTable,
		attemptId: uuid("attempt_id")
			.notNull()
			.references(() => interviewAttempt.id, { onDelete: "cascade" }),
		// Canonical conversation order; timestamps are analytical metadata.
		sequence: integer("sequence").notNull(),
		role: turnRole("role").notNull(),
		text: text("text").notNull(),
		// Server-observed utterance window; it does not claim client playback time.
		startedAt: timestamp("started_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		// Candidate-provided replay key; assistant turns do not need one.
		clientTurnId: uuid("client_turn_id"),
	},
	(table) => [
		uniqueIndex("interview_turn_sequence_unique").on(
			table.attemptId,
			table.sequence,
		),
		uniqueIndex("interview_turn_client_turn_unique").on(
			table.attemptId,
			table.clientTurnId,
		),
		check("interview_turn_sequence_check", sql`${table.sequence} > 0`),
		check(
			"interview_turn_time_range_check",
			sql`${table.endedAt} is null or (${table.startedAt} is not null and ${table.endedAt} >= ${table.startedAt})`,
		),
	],
);

export const interviewAttemptRelations = relations(
	interviewAttempt,
	({ one, many }) => ({
		interview: one(interview, {
			fields: [interviewAttempt.interviewId],
			references: [interview.id],
		}),
		candidate: one(user, {
			fields: [interviewAttempt.candidateId],
			references: [user.id],
		}),
		progress: many(attemptQuestionProgress),
		turns: many(interviewTurn),
	}),
);

export const attemptQuestionProgressRelations = relations(
	attemptQuestionProgress,
	({ one }) => ({
		attempt: one(interviewAttempt, {
			fields: [attemptQuestionProgress.attemptId],
			references: [interviewAttempt.id],
		}),
		question: one(interviewQuestion, {
			fields: [attemptQuestionProgress.questionId],
			references: [interviewQuestion.id],
		}),
	}),
);

export const interviewTurnRelations = relations(interviewTurn, ({ one }) => ({
	attempt: one(interviewAttempt, {
		fields: [interviewTurn.attemptId],
		references: [interviewAttempt.id],
	}),
}));
