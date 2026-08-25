import z from "zod";

export const ATTEMPT_STATES = [
	"READY",
	"ASSISTANT_SPEAKING",
	"LISTENING",
	"PROCESSING",
	"ENDING",
	"COMPLETED",
	"FAILED",
] as const;

export const ATTEMPT_END_REASONS = ["AI_COMPLETED", "TIME_LIMIT"] as const;

export const INTERVIEW_TURN_ROLES = ["assistant", "candidate"] as const;

export const AttemptStateSchema = z.enum(ATTEMPT_STATES);
export const AttemptEndReasonSchema = z.enum(ATTEMPT_END_REASONS);
export const InterviewTurnRoleSchema = z.enum(INTERVIEW_TURN_ROLES);

export type AttemptState = z.infer<typeof AttemptStateSchema>;
export type AttemptEndReason = z.infer<typeof AttemptEndReasonSchema>;
export type InterviewTurnRole = z.infer<typeof InterviewTurnRoleSchema>;
