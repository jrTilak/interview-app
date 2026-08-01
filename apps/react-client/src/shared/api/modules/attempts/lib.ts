import { getInterviewAttempts } from "@/shared/api/generated/application/interview-attempts/interview-attempts";
import type { AttemptSnapshotResponseDto } from "@/shared/api/generated/application/models";
import { requireResponseData } from "@/shared/api/response";

const attemptsApi = getInterviewAttempts();

export type { AttemptSnapshotResponseDto };

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
