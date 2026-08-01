import { createZodDto } from "nestjs-zod";
import z from "zod";

const NullableDateTimeSchema = z.iso.datetime({ offset: true }).nullable();

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

export class AttemptTurnResponseDto extends createZodDto(
	AttemptTurnResponseSchema,
) {}
export class AttemptSnapshotResponseDto extends createZodDto(
	AttemptSnapshotResponseSchema,
) {}

export type AttemptSnapshot = z.infer<typeof AttemptSnapshotResponseSchema>;
