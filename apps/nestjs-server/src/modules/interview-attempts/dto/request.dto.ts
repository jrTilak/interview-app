import { createZodDto } from "nestjs-zod";
import z from "zod";

export const AttemptIdParamsSchema = z
	.object({
		id: z.uuid("Attempt ID must be a valid UUID").meta({
			description: "Candidate interview attempt UUID.",
			example: "f0c765b0-a9fe-4a67-bf75-a63486949831",
		}),
	})
	.strict();

export class AttemptIdParamsDto extends createZodDto(AttemptIdParamsSchema) {}
