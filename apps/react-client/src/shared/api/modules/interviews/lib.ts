import { apiClient } from "@/shared/api/client";
import { getInterviews } from "@/shared/api/generated/application/interviews/interviews";
import type {
	CreateInterviewDto,
	InterviewDetailsResponseDto,
	InterviewSummaryResponseDto,
	SharedInterviewPreviewResponseDto,
} from "@/shared/api/generated/application/models";
import { getSharedInterviews } from "@/shared/api/generated/application/shared-interviews/shared-interviews";
import { requireResponseData } from "@/shared/api/response";

const interviewsApi = getInterviews();
const sharedInterviewsApi = getSharedInterviews();

export type {
	CreateInterviewDto,
	InterviewDetailsResponseDto,
	InterviewSummaryResponseDto,
	SharedInterviewPreviewResponseDto,
};

export type UpdateInterviewDto = {
	title?: string;
	description?: string | null;
	durationMinutes?: number;
	allowMultipleAttempts?: boolean;
};

/** Lists interviews owned by the active creator. */
export async function listInterviews(): Promise<InterviewSummaryResponseDto[]> {
	return requireResponseData(await interviewsApi.interviewsControllerFindAll());
}

/** Retrieves creator-only interview details. */
export async function getInterview(
	id: string,
): Promise<InterviewDetailsResponseDto> {
	return requireResponseData(
		await interviewsApi.interviewsControllerFindById(id),
	);
}

/** Creates an interview while preserving the caller's idempotency key. */
export async function createInterview(
	input: CreateInterviewDto,
): Promise<InterviewDetailsResponseDto> {
	return requireResponseData(
		await interviewsApi.interviewsControllerCreate(input),
	);
}

/** Updates mutable recruiter-controlled interview metadata. */
export async function updateInterview({
	id,
	data,
}: {
	id: string;
	data: UpdateInterviewDto;
}): Promise<InterviewDetailsResponseDto> {
	return requireResponseData(
		await apiClient<{ data?: InterviewDetailsResponseDto }>({
			data,
			method: "PATCH",
			url: `/api/interviews/${id}`,
		}),
	);
}

/** Deletes one unused creator-owned interview. */
export async function deleteInterview(id: string): Promise<{ id: string }> {
	return requireResponseData(
		await apiClient<{ data?: { id: string } }>({
			method: "DELETE",
			url: `/api/interviews/${id}`,
		}),
	);
}

/** Retrieves the candidate-safe metadata behind a share code. */
export async function getSharedInterview(
	shareCode: string,
): Promise<SharedInterviewPreviewResponseDto> {
	return requireResponseData(
		await sharedInterviewsApi.sharedInterviewsControllerPreview(shareCode),
	);
}
