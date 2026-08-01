import { queryOptions } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { getInterview, getSharedInterview, listInterviews } from "./lib";

export function interviewListQueryOptions() {
	return queryOptions({
		meta: { persist: false },
		queryFn: listInterviews,
		queryKey: QUERY_KEYS.interviews.list(),
	});
}

export function interviewDetailQueryOptions(id: string) {
	return queryOptions({
		enabled: id.length > 0,
		meta: { persist: false },
		queryFn: () => getInterview(id),
		queryKey: QUERY_KEYS.interviews.detail(id),
	});
}

export function sharedInterviewQueryOptions(shareCode: string) {
	return queryOptions({
		enabled: shareCode.length > 0,
		meta: { persist: false },
		queryFn: () => getSharedInterview(shareCode),
		queryKey: QUERY_KEYS.sharedInterviews.preview(shareCode),
		staleTime: 5 * 60 * 1000,
	});
}
