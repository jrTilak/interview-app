export const QUERY_KEYS = {
	auth: {
		session: () => ["auth", "session"] as const,
	},
	attempts: {
		all: () => ["attempts"] as const,
		detail: (id: string) => [...QUERY_KEYS.attempts.all(), id] as const,
	},
	interviews: {
		all: () => ["interviews"] as const,
		detail: (id: string) =>
			[...QUERY_KEYS.interviews.all(), "detail", id] as const,
		list: () => [...QUERY_KEYS.interviews.all(), "list"] as const,
	},
	sharedInterviews: {
		all: () => ["shared-interviews"] as const,
		preview: (shareCode: string) =>
			[...QUERY_KEYS.sharedInterviews.all(), shareCode] as const,
	},
} as const;
