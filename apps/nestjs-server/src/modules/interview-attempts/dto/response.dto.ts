import { createZodDto } from "nestjs-zod";
import z from "zod";

const DateTimeSchema = z.iso.datetime({ offset: true });
const NullableDateTimeSchema = DateTimeSchema.nullable();

export const AttemptStateSchema = z.enum([
	"READY",
	"ASSISTANT_SPEAKING",
	"LISTENING",
	"PROCESSING",
	"ENDING",
	"COMPLETED",
	"FAILED",
]);

export const AttemptTurnResponseSchema = z
	.object({
		id: z.uuid(),
		sequence: z.number().int().positive(),
		role: z.enum(["assistant", "candidate"]),
		text: z.string(),
		createdAt: z.iso.datetime({ offset: true }),
	})
	.strict();

export const AttemptSnapshotResponseSchema = z
	.object({
		id: z.uuid(),
		state: AttemptStateSchema,
		startedAt: NullableDateTimeSchema,
		deadlineAt: NullableDateTimeSchema,
		endedAt: NullableDateTimeSchema,
		endReason: z.enum(["AI_COMPLETED", "TIME_LIMIT"]).nullable(),
		media: z
			.object({
				cameraActive: z.boolean(),
				screenActive: z.boolean(),
				microphoneActive: z.boolean(),
			})
			.strict(),
		turns: z.array(AttemptTurnResponseSchema),
	})
	.strict();

const AttemptHistoryFieldsSchema = z
	.object({
		id: z.uuid(),
		state: AttemptStateSchema,
		endReason: z.enum(["AI_COMPLETED", "TIME_LIMIT"]).nullable(),
		createdAt: DateTimeSchema,
		startedAt: NullableDateTimeSchema,
		deadlineAt: NullableDateTimeSchema,
		endedAt: NullableDateTimeSchema,
		completedQuestionCount: z.number().int().nonnegative(),
		totalQuestionCount: z.number().int().nonnegative(),
	})
	.strict();

export const CreatorAttemptHistoryResponseSchema =
	AttemptHistoryFieldsSchema.extend({
		candidate: z
			.object({
				id: z.uuid(),
				name: z.string(),
				email: z.email(),
			})
			.strict(),
	});

export const CandidateAttemptHistoryResponseSchema = AttemptHistoryFieldsSchema;

export const CandidateInterviewHistoryResponseSchema = z
	.object({
		interview: z
			.object({
				id: z.uuid(),
				title: z.string(),
				description: z.string().nullable(),
				shareCode: z.string(),
				durationMinutes: z.number().int().positive(),
				allowMultipleAttempts: z.boolean(),
			})
			.strict(),
		attempts: z.array(CandidateAttemptHistoryResponseSchema),
	})
	.strict();

export class AttemptTurnResponseDto extends createZodDto(
	AttemptTurnResponseSchema,
) {}
export class AttemptSnapshotResponseDto extends createZodDto(
	AttemptSnapshotResponseSchema,
) {}
export class CreatorAttemptHistoryResponseDto extends createZodDto(
	CreatorAttemptHistoryResponseSchema,
) {}
export class CandidateAttemptHistoryResponseDto extends createZodDto(
	CandidateAttemptHistoryResponseSchema,
) {}
export class CandidateInterviewHistoryResponseDto extends createZodDto(
	CandidateInterviewHistoryResponseSchema,
) {}

export type AttemptSnapshot = z.infer<typeof AttemptSnapshotResponseSchema>;
export type CreatorAttemptHistory = z.infer<
	typeof CreatorAttemptHistoryResponseSchema
>;
export type CandidateInterviewHistory = z.infer<
	typeof CandidateInterviewHistoryResponseSchema
>;
