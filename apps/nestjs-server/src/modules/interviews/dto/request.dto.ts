import {
	createUpdateSchema,
	DescriptionSchema,
	TitleSchema,
	UuidSchema,
} from "@interview-desk/validations";
import { createZodDto } from "nestjs-zod";
import z from "zod";

export const InterviewIdParamsSchema = z
	.object({
		id: UuidSchema.meta({
			description: "Interview UUID.",
			example: "7635f24a-adb3-457c-8e43-2d0a1a8fa0df",
		}),
	})
	.strict();

export const CreateInterviewSchema = z
	.object({
		title: TitleSchema.meta({
			description: "Interview title.",
			example: "Junior React Developer",
		}),
		description: DescriptionSchema.optional().meta({
			description: "Optional context the local interviewer should know.",
			example: "A 30-minute final-year project interview.",
		}),
		rawQuestions: DescriptionSchema.meta({
			description:
				"Private topic notes converted into conversational interview boundaries.",
			example:
				"React hooks and state ownership. A difficult debugging experience.",
		}),
		durationMinutes: z.number().meta({
			description: "Interview time limit in minutes.",
			example: 30,
		}),
		allowMultipleAttempts: z.boolean().optional().meta({
			description:
				"Whether a candidate may start another attempt after a previous attempt finishes.",
			example: false,
		}),
	})
	.strict();

export const UpdateInterviewSchema = createUpdateSchema(
	CreateInterviewSchema.omit({ rawQuestions: true }).extend({
		description: DescriptionSchema.nullable().meta({
			description: "Updated interview context. Use null to remove it.",
			example: null,
		}),
		isPublic: z.boolean().meta({
			description: "Whether the interview is accessible through its ID.",
			example: true,
		}),
	}),
	"At least one interview field must be updated",
);

export class InterviewIdParamsDto extends createZodDto(
	InterviewIdParamsSchema,
) {}
export class CreateInterviewDto extends createZodDto(CreateInterviewSchema) {}
export class UpdateInterviewDto extends createZodDto(UpdateInterviewSchema) {}
