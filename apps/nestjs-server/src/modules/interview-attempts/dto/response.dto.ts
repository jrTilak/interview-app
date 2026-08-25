import {
	AttemptEndReasonSchema,
	AttemptStateSchema,
	DateTimeSchema,
	DescriptionSchema,
	EmailSchema,
	InterviewTurnRoleSchema,
	NameSchema,
	TitleSchema,
	UuidSchema,
} from "@interview-desk/validations";
import { createZodDto } from "nestjs-zod";
import z from "zod";

const NullableDateTimeSchema = DateTimeSchema.nullable();

export { AttemptStateSchema };

export const AttemptTurnResponseSchema = z.object({
	id: UuidSchema,
	sequence: z.number(),
	role: InterviewTurnRoleSchema,
	text: z.string(),
	startedAt: NullableDateTimeSchema,
	endedAt: NullableDateTimeSchema,
	createdAt: DateTimeSchema,
});

export const AttemptSnapshotResponseSchema = z.object({
	id: UuidSchema,
	state: AttemptStateSchema,
	startedAt: NullableDateTimeSchema,
	deadlineAt: NullableDateTimeSchema,
	endedAt: NullableDateTimeSchema,
	endReason: AttemptEndReasonSchema.nullable(),
	media: z.object({
		cameraActive: z.boolean(),
		screenActive: z.boolean(),
		microphoneActive: z.boolean(),
	}),
	turns: z.array(AttemptTurnResponseSchema),
});

const AttemptHistoryFieldsSchema = z.object({
	id: UuidSchema,
	state: AttemptStateSchema,
	endReason: AttemptEndReasonSchema.nullable(),
	createdAt: DateTimeSchema,
	startedAt: NullableDateTimeSchema,
	deadlineAt: NullableDateTimeSchema,
	endedAt: NullableDateTimeSchema,
	completedQuestionCount: z.number(),
	totalQuestionCount: z.number(),
});

export const CreatorAttemptHistoryResponseSchema =
	AttemptHistoryFieldsSchema.extend({
		candidate: z.object({
			id: UuidSchema,
			name: NameSchema,
			email: EmailSchema,
		}),
	});

export const CandidateAttemptHistoryResponseSchema = AttemptHistoryFieldsSchema;

export const CandidateInterviewHistoryResponseSchema = z.object({
	interview: z.object({
		id: UuidSchema,
		title: TitleSchema,
		description: DescriptionSchema.nullable(),
		durationMinutes: z.number(),
		allowMultipleAttempts: z.boolean(),
	}),
	attempts: z.array(CandidateAttemptHistoryResponseSchema),
});

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
