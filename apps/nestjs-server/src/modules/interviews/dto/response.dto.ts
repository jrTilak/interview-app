import {
	DateTimeSchema,
	DescriptionSchema,
	TitleSchema,
	UuidSchema,
} from "@interview-desk/validations";
import { createZodDto } from "nestjs-zod";
import z from "zod";

export const InterviewQuestionResponseSchema = z
	.object({
		id: UuidSchema.meta({
			description: "Interview question UUID.",
			example: "d47b2f2f-3b62-4fc5-a5a7-d11149b280fd",
		}),
		position: z.number().meta({
			description: "Question order within the interview.",
			example: 1,
		}),
		title: TitleSchema.meta({
			description: "Short question topic shown to the interviewer.",
			example: "React state ownership",
		}),
		prompt: DescriptionSchema.meta({
			description: "Question prompt used by the interviewer.",
			example: "Explain how you decide where React state should live.",
		}),
		objective: DescriptionSchema.nullable().meta({
			description: "What the question is intended to evaluate, when provided.",
			example: "Evaluate understanding of state ownership and data flow.",
		}),
		followUpGuidance: DescriptionSchema.nullable().meta({
			description: "Optional guidance for asking a follow-up question.",
			example: "Ask for an example involving shared state.",
		}),
	})
	.strict();

export const InterviewSummaryResponseSchema = z
	.object({
		id: UuidSchema.meta({
			description: "Interview UUID and public share identifier.",
			example: "7635f24a-adb3-457c-8e43-2d0a1a8fa0df",
		}),
		title: TitleSchema.meta({
			description: "Interview title.",
			example: "Junior React Developer",
		}),
		description: DescriptionSchema.nullable().meta({
			description: "Optional interview context.",
			example: "A focused interview about React fundamentals.",
		}),
		durationMinutes: z.number().meta({
			description: "Interview time limit in minutes.",
			example: 30,
		}),
		allowMultipleAttempts: z.boolean().meta({
			description:
				"Whether a candidate may attempt the interview more than once.",
			example: false,
		}),
		questionCount: z.number().meta({
			description: "Number of structured questions in the interview.",
			example: 5,
		}),
		isPublic: z.boolean().meta({
			description:
				"Whether candidates can access the interview through its ID.",
			example: false,
		}),
		createdAt: DateTimeSchema.meta({
			description: "Date and time when the interview was created.",
			example: "2026-08-25T10:30:00.000Z",
		}),
	})
	.strict();

export const InterviewDetailsResponseSchema =
	InterviewSummaryResponseSchema.extend({
		rawQuestions: DescriptionSchema.meta({
			description: "Private topic notes supplied by the interview creator.",
			example: "React hooks, state ownership, and debugging experience.",
		}),
		questions: z.array(InterviewQuestionResponseSchema).meta({
			description: "Ordered questions prepared for the interview.",
		}),
	});

export const SharedInterviewPreviewResponseSchema =
	InterviewSummaryResponseSchema.pick({
		title: true,
		description: true,
		durationMinutes: true,
		allowMultipleAttempts: true,
		questionCount: true,
	});

export const DeletedInterviewResponseSchema = z
	.object({
		id: UuidSchema.meta({
			description: "UUID of the deleted interview.",
			example: "7635f24a-adb3-457c-8e43-2d0a1a8fa0df",
		}),
	})
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
