import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import {
	createInterview,
	deleteInterview,
	type UpdateInterviewId,
	type UpdateInterviewInput,
	updateInterview,
} from "./lib";

/** Creates an interview and reconciles creator list/detail caches. */
export function useCreateInterview() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: createInterview,
		async onSuccess(response) {
			cache.setQueryData(
				QUERY_KEYS.interviews.detail(response.data.id),
				response,
			);
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
		mutationFn: ({ id, data }: UpdateInterviewVariables) =>
			updateInterview(id, data),
		async onSuccess(response) {
			cache.setQueryData(
				QUERY_KEYS.interviews.detail(response.data.id),
				response,
			);
			await cache.invalidateQueries({ queryKey: QUERY_KEYS.interviews.list() });
		},
	});
}

/** Removes one interview from every recruiter cache. */
export function useDeleteInterview() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: deleteInterview,
		async onSuccess(response) {
			cache.removeQueries({
				queryKey: QUERY_KEYS.interviews.detail(response.data.id),
			});
			await cache.invalidateQueries({ queryKey: QUERY_KEYS.interviews.list() });
		},
	});
}

type UpdateInterviewVariables = {
	id: UpdateInterviewId;
	data: UpdateInterviewInput;
};
