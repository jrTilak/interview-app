import { getInterviewAttempts } from "@/shared/api/generated/application/interview-attempts/interview-attempts";
import type {
	AttemptSnapshotResponseDto,
	CandidateInterviewHistoryResponseDto,
	CreatorAttemptHistoryResponseDto,
} from "@/shared/api/generated/application/models";
import { requireResponseData } from "@/shared/api/response";

const attemptsApi = getInterviewAttempts();

export type {
	AttemptSnapshotResponseDto,
	CandidateInterviewHistoryResponseDto,
	CreatorAttemptHistoryResponseDto,
};

/** Creates or resumes this candidate's unique attempt. */
export async function joinInterview(
	shareCode: string,
): Promise<AttemptSnapshotResponseDto> {
	return requireResponseData(
		await attemptsApi.interviewAttemptsControllerCreateOrResume(shareCode),
	);
}

/** Retrieves a candidate-owned reconnect snapshot. */
export async function getAttempt(
	id: string,
): Promise<AttemptSnapshotResponseDto> {
	return requireResponseData(
		await attemptsApi.interviewAttemptsControllerFindSnapshot(id),
	);
}

/** Lists every interview taken by the active user, grouped with all attempts. */
export async function listAttemptHistory(): Promise<
	CandidateInterviewHistoryResponseDto[]
> {
	return requireResponseData(
		await attemptsApi.interviewAttemptsControllerFindAllHistory(),
	);
}

/** Lists participant attempt facts for a creator-owned interview. */
export async function listInterviewParticipantAttempts(
	interviewId: string,
): Promise<CreatorAttemptHistoryResponseDto[]> {
	return requireResponseData(
		await attemptsApi.interviewAttemptsControllerFindAttempts(interviewId),
	);
}
