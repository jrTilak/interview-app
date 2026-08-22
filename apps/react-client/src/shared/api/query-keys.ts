export const QUERY_KEYS = {
	devFlags: {
		current: () => ["dev-flags"] as const,
	},
	auth: {
		session: () => ["auth", "session"] as const,
	},
	attempts: {
		all: () => ["attempts"] as const,
		detail: (id: string) => [...QUERY_KEYS.attempts.all(), id] as const,
		history: () => [...QUERY_KEYS.attempts.all(), "history"] as const,
	},
	interviews: {
		all: () => ["interviews"] as const,
		detail: (id: string) =>
			[...QUERY_KEYS.interviews.all(), "detail", id] as const,
		list: () => [...QUERY_KEYS.interviews.all(), "list"] as const,
		participantAttempts: (id: string) =>
			[...QUERY_KEYS.interviews.detail(id), "attempts"] as const,
	},
	sharedInterviews: {
		all: () => ["shared-interviews"] as const,
		preview: (shareCode: string) =>
			[...QUERY_KEYS.sharedInterviews.all(), shareCode] as const,
	},
} as const;
