export const INTERVIEW_LIMITS = {
	title: { minimum: 3, maximum: 160 },
	description: { maximum: 2_000 },
	rawQuestions: { minimum: 3, maximum: 20_000 },
	durationMinutes: { minimum: 5, maximum: 120, default: 30 },
	structuredQuestions: { minimum: 1, maximum: 30 },
} as const;

export const SHARE_CODE_LENGTH = 32;
