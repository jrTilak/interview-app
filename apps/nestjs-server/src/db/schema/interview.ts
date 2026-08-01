import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { baseTable } from "./base-table.js";
import { user } from "./better-auth.js";

export const interview = pgTable(
	"interview",
	{
		...baseTable,
		createdById: uuid("created_by_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		clientRequestId: uuid("client_request_id").notNull(),
		title: varchar("title", { length: 160 }).notNull(),
		description: text("description"),
		rawQuestions: text("raw_questions").notNull(),
		durationMinutes: integer("duration_minutes").notNull().default(30),
		shareCode: varchar("share_code", { length: 32 }).notNull(),
	},
	(table) => [
		uniqueIndex("interview_owner_request_unique").on(
			table.createdById,
			table.clientRequestId,
		),
		uniqueIndex("interview_share_code_unique").on(table.shareCode),
		index("interview_owner_created_idx").on(table.createdById, table.createdAt),
		check(
			"interview_duration_minutes_check",
			sql`${table.durationMinutes} between 5 and 120`,
		),
	],
);

export const interviewQuestion = pgTable(
	"interview_question",
	{
		...baseTable,
		interviewId: uuid("interview_id")
			.notNull()
			.references(() => interview.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		title: varchar("title", { length: 160 }).notNull(),
		prompt: text("prompt").notNull(),
		objective: text("objective"),
		followUpGuidance: text("follow_up_guidance"),
	},
	(table) => [
		uniqueIndex("interview_question_position_unique").on(
			table.interviewId,
			table.position,
		),
		index("interview_question_interview_idx").on(table.interviewId),
		check("interview_question_position_check", sql`${table.position} > 0`),
	],
);

export const interviewRelations = relations(interview, ({ one, many }) => ({
	creator: one(user, {
		fields: [interview.createdById],
		references: [user.id],
	}),
	questions: many(interviewQuestion),
}));

export const interviewQuestionRelations = relations(
	interviewQuestion,
	({ one }) => ({
		interview: one(interview, {
			fields: [interviewQuestion.interviewId],
			references: [interview.id],
		}),
	}),
);
