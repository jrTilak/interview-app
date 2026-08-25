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

export const attemptState = pgEnum("interview_attempt_state", [
	"READY",
	"ASSISTANT_SPEAKING",
	"LISTENING",
	"PROCESSING",
	"ENDING",
	"COMPLETED",
	"FAILED",
]);

export const attemptEndReason = pgEnum("interview_attempt_end_reason", [
	"AI_COMPLETED",
	"TIME_LIMIT",
]);

export const questionProgressState = pgEnum("question_progress_state", [
	"PENDING",
	"COMPLETED",
]);

export const turnRole = pgEnum("interview_turn_role", [
	"ASSISTANT",
	"CANDIDATE",
]);

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
		version: integer("version").notNull().default(0),
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
		turnCount: integer("turn_count").notNull().default(0),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [
		primaryKey({ columns: [table.attemptId, table.questionId] }),
		index("attempt_question_question_idx").on(table.questionId),
		check("attempt_question_turn_count_check", sql`${table.turnCount} >= 0`),
	],
);

export const interviewTurn = pgTable(
	"interview_turn",
	{
		...baseTable,
		attemptId: uuid("attempt_id")
			.notNull()
			.references(() => interviewAttempt.id, { onDelete: "cascade" }),
		sequence: integer("sequence").notNull(),
		role: turnRole("role").notNull(),
		text: text("text").notNull(),
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
