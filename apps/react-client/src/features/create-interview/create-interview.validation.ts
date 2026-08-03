import { z } from "zod";

export const CreateInterviewSchema = z.object({
	allowMultipleAttempts: z.boolean(),
	title: z
		.string()
		.trim()
		.min(3, "Title must contain at least 3 characters.")
		.max(160, "Title cannot exceed 160 characters."),
	description: z
		.string()
		.trim()
		.max(2000, "Description cannot exceed 2,000 characters.")
		.transform((value) => value || undefined),
	durationMinutes: z
		.number()
		.int("Duration must be a whole number.")
		.min(5, "Duration must be at least 5 minutes.")
		.max(120, "Duration cannot exceed 120 minutes."),
	rawQuestions: z
		.string()
		.trim()
		.min(3, "Add at least one question or instruction.")
		.max(20_000, "Question notes cannot exceed 20,000 characters."),
});

export type CreateInterviewValues = z.input<typeof CreateInterviewSchema>;
