import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { createInterview, deleteInterview, updateInterview } from "./lib";

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

/** Updates one interview and reconciles list/detail caches. */
export function useUpdateInterview() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: updateInterview,
		async onSuccess(interview) {
			cache.setQueryData(QUERY_KEYS.interviews.detail(interview.id), interview);
			await cache.invalidateQueries({ queryKey: QUERY_KEYS.interviews.list() });
		},
	});
}

/** Removes one interview from every recruiter cache. */
export function useDeleteInterview() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: deleteInterview,
		async onSuccess({ id }) {
			cache.removeQueries({ queryKey: QUERY_KEYS.interviews.detail(id) });
			await cache.invalidateQueries({ queryKey: QUERY_KEYS.interviews.list() });
		},
	});
}
