import { queryOptions } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { getAttempt } from "./lib";

export function attemptQueryOptions(id: string) {
	return queryOptions({
		enabled: id.length > 0,
		meta: { persist: false },
		queryFn: () => getAttempt(id),
		queryKey: QUERY_KEYS.attempts.detail(id),
		refetchOnMount: "always",
		staleTime: 0,
	});
}
