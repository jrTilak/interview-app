import { QueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";

export const queryClient = new QueryClient({
	defaultOptions: {
		mutations: { retry: false },
		queries: {
			gcTime: 30 * 60 * 1000,
			refetchOnWindowFocus: true,
			retry: 1,
			staleTime: 30 * 1000,
		},
	},
});

/** Clears cached server state that belongs to the signed-in user. */
export function clearUserScopedCache(): void {
	for (const queryKey of [
		QUERY_KEYS.interviews.all(),
		QUERY_KEYS.sharedInterviews.all(),
		QUERY_KEYS.attempts.all(),
	]) {
		queryClient.removeQueries({ queryKey });
	}
}
