import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { createInterview } from "./lib";

/** Creates an interview and reconciles creator list/detail caches. */
export function useCreateInterview() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: createInterview,
		async onSuccess(interview) {
			cache.setQueryData(QUERY_KEYS.interviews.detail(interview.id), interview);
			await cache.invalidateQueries({
				queryKey: QUERY_KEYS.interviews.list(),
			});
		},
	});
}
