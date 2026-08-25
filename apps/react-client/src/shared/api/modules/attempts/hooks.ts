import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { joinInterview } from "./lib";

/** Starts an attempt and seeds its initial snapshot cache. */
export function useJoinInterview() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: joinInterview,
		onSuccess(response) {
			cache.setQueryData(
				QUERY_KEYS.attempts.detail(response.data.id),
				response,
			);
			void cache.invalidateQueries({
				queryKey: QUERY_KEYS.attempts.history(),
			});
		},
	});
}
