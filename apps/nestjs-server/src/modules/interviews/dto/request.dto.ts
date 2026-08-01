import { createZodDto } from "nestjs-zod";
import z from "zod";
import { INTERVIEW_LIMITS, SHARE_CODE_LENGTH } from "../interview.constants.js";

export const InterviewIdParamsSchema = z
	.object({
		id: z.uuid("Interview ID must be a valid UUID").meta({
			description: "Interview UUID.",
			example: "7635f24a-adb3-457c-8e43-2d0a1a8fa0df",
		}),
	})
	.strict();

export const ShareCodeParamsSchema = z
	.object({
		shareCode: z
			.string()
			.length(SHARE_CODE_LENGTH)
			.regex(/^[A-Za-z0-9_-]+$/, "Share code is invalid")
			.meta({
				description: "Unguessable share code from the interview link.",
				example: "uF7qP8Q3bFvLXrAQdS5kMK0pNPkVsU8_",
			}),
	})
	.strict();

export const CreateInterviewSchema = z
	.object({
		clientRequestId: z.uuid().meta({
			description: "Client-generated idempotency UUID.",
			example: "f1fe6e65-4d76-4d21-96dc-4a4aa841f4ea",
		}),
		title: z
			.string()
			.trim()
			.min(INTERVIEW_LIMITS.title.minimum)
			.max(INTERVIEW_LIMITS.title.maximum)
			.meta({
				description: "Interview title.",
				example: "Junior React Developer",
			}),
		description: z
			.string()
			.trim()
			.min(1)
			.max(INTERVIEW_LIMITS.description.maximum)
			.optional()
			.meta({
				description: "Optional context the AI interviewer should know.",
				example: "A 30-minute final-year project interview.",
			}),
		rawQuestions: z
			.string()
			.trim()
			.min(INTERVIEW_LIMITS.rawQuestions.minimum)
			.max(INTERVIEW_LIMITS.rawQuestions.maximum)
			.meta({
				description:
					"Raw question notes converted to structured interview tasks.",
				example:
					"Ask about React hooks. Then ask them to explain one difficult bug.",
			}),
		durationMinutes: z
			.number()
			.int()
			.min(INTERVIEW_LIMITS.durationMinutes.minimum)
			.max(INTERVIEW_LIMITS.durationMinutes.maximum)
			.default(INTERVIEW_LIMITS.durationMinutes.default)
			.meta({
				description: "Hard interview time limit in minutes.",
				example: 30,
			}),
	})
	.strict();

export class InterviewIdParamsDto extends createZodDto(
	InterviewIdParamsSchema,
) {}
export class ShareCodeParamsDto extends createZodDto(ShareCodeParamsSchema) {}
export class CreateInterviewDto extends createZodDto(CreateInterviewSchema) {}
