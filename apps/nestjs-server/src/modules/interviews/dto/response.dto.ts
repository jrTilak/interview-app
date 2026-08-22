import { createZodDto } from "nestjs-zod";
import z from "zod";

const DateTimeSchema = z.iso.datetime({ offset: true });

export const InterviewQuestionResponseSchema = z
	.object({
		id: z.uuid(),
		position: z.number().int().positive(),
		title: z.string(),
		prompt: z.string(),
		objective: z.string().nullable(),
		followUpGuidance: z.string().nullable(),
	})
	.strict();

export const InterviewSummaryResponseSchema = z
	.object({
		id: z.uuid(),
		title: z.string(),
		description: z.string().nullable(),
		durationMinutes: z.number().int(),
		allowMultipleAttempts: z.boolean(),
		questionCount: z.number().int().nonnegative(),
		shareCode: z.string(),
		shareUrl: z.url(),
		createdAt: DateTimeSchema,
	})
	.strict();

export const InterviewDetailsResponseSchema =
	InterviewSummaryResponseSchema.extend({
		rawQuestions: z.string(),
		questions: z.array(InterviewQuestionResponseSchema),
	});

export const SharedInterviewPreviewResponseSchema = z
	.object({
		title: z.string(),
		description: z.string().nullable(),
		durationMinutes: z.number().int(),
		allowMultipleAttempts: z.boolean(),
		questionCount: z.number().int().nonnegative(),
	})
	.strict();

export const DeletedInterviewResponseSchema = z
	.object({ id: z.uuid() })
	.strict();

export class InterviewQuestionResponseDto extends createZodDto(
	InterviewQuestionResponseSchema,
) {}
export class InterviewSummaryResponseDto extends createZodDto(
	InterviewSummaryResponseSchema,
) {}
export class InterviewDetailsResponseDto extends createZodDto(
	InterviewDetailsResponseSchema,
) {}
export class SharedInterviewPreviewResponseDto extends createZodDto(
	SharedInterviewPreviewResponseSchema,
) {}
export class DeletedInterviewResponseDto extends createZodDto(
	DeletedInterviewResponseSchema,
) {}
