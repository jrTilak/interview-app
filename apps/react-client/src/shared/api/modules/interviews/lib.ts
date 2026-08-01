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

/** Retrieves the candidate-safe metadata behind a share code. */
export async function getSharedInterview(
	shareCode: string,
): Promise<SharedInterviewPreviewResponseDto> {
	return requireResponseData(
		await sharedInterviewsApi.sharedInterviewsControllerPreview(shareCode),
	);
}
