import { queryOptions } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { getInterview, getSharedInterview, listInterviews } from "./lib";

export function interviewListQueryOptions() {
	return queryOptions({
		meta: { persist: false },
		queryFn: listInterviews,
		queryKey: QUERY_KEYS.interviews.list(),
		select: (response) => response.data,
	});
}

export function interviewDetailQueryOptions(id: string) {
	return queryOptions({
		enabled: id.length > 0,
		meta: { persist: false },
		queryFn: () => getInterview(id),
		queryKey: QUERY_KEYS.interviews.detail(id),
		select: (response) => response.data,
	});
}

export function sharedInterviewQueryOptions(shareCode: string) {
	return queryOptions({
		enabled: shareCode.length > 0,
		meta: { persist: false },
		queryFn: () => getSharedInterview(shareCode),
		queryKey: QUERY_KEYS.sharedInterviews.preview(shareCode),
		select: (response) => response.data,
		staleTime: 5 * 60 * 1000,
	});
}
