import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { joinInterview } from "./lib";

/** Joins once and seeds the reconnect snapshot cache. */
export function useJoinInterview() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: joinInterview,
		onSuccess(snapshot) {
			cache.setQueryData(QUERY_KEYS.attempts.detail(snapshot.id), snapshot);
		},
	});
}
