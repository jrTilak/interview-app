import { queryOptions } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { getSession } from "./lib";

/** Defines a non-persisted, server-authoritative session query. */
export function sessionQueryOptions() {
	return queryOptions({
		meta: { persist: false },
		queryFn: getSession,
		queryKey: QUERY_KEYS.auth.session(),
		refetchOnMount: "always",
		retry: false,
		staleTime: 0,
	});
}
