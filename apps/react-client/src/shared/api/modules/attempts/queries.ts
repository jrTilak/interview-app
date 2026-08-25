import { queryOptions } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import {
	getAttempt,
	listAttemptHistory,
	listInterviewParticipantAttempts,
} from "./lib";

export function attemptQueryOptions(id: string) {
	return queryOptions({
		enabled: id.length > 0,
		meta: { persist: false },
		queryFn: () => getAttempt(id),
		queryKey: QUERY_KEYS.attempts.detail(id),
		refetchOnMount: "always",
		select: (response) => response.data,
		staleTime: 0,
	});
}

export function attemptHistoryQueryOptions() {
	return queryOptions({
		meta: { persist: false },
		queryFn: listAttemptHistory,
		queryKey: QUERY_KEYS.attempts.history(),
		select: (response) => response.data,
	});
}

export function interviewParticipantAttemptsQueryOptions(interviewId: string) {
	return queryOptions({
		enabled: interviewId.length > 0,
		meta: { persist: false },
		queryFn: () => listInterviewParticipantAttempts(interviewId),
		queryKey: QUERY_KEYS.interviews.participantAttempts(interviewId),
		select: (response) => response.data,
	});
}
