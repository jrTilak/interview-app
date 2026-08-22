import { queryOptions } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { getDevFlags } from "./lib";

export function devFlagsQueryOptions() {
	return queryOptions({
		meta: { persist: false },
		queryFn: getDevFlags,
		queryKey: QUERY_KEYS.devFlags.current(),
		refetchInterval: 5_000,
		staleTime: 2_000,
	});
}
