import {
	interviewsControllerCreate as createInterview,
	interviewsControllerRemove as deleteInterview,
	interviewsControllerFindById as getInterview,
	interviewsControllerPreview as getSharedInterview,
	interviewsControllerFindAll as listInterviews,
	interviewsControllerUpdate as updateInterview,
} from "@/shared/api/generated/application/interviews/interviews";

export type CreateInterviewInput = Parameters<typeof createInterview>[0];
export type CreateInterviewOutput = Awaited<ReturnType<typeof createInterview>>;
export type CreateInterviewDto = CreateInterviewInput;
export { createInterview };

export type ListInterviewsOutput = Awaited<ReturnType<typeof listInterviews>>;
export type InterviewListItem = ListInterviewsOutput["data"][number];
export type InterviewSummaryResponseDto = InterviewListItem;
export { listInterviews };

export type GetInterviewInput = Parameters<typeof getInterview>[0];
export type GetInterviewOutput = Awaited<ReturnType<typeof getInterview>>;
export type Interview = GetInterviewOutput["data"];
export type InterviewDetailsResponseDto = Interview;
export { getInterview };

export type UpdateInterviewId = Parameters<typeof updateInterview>[0];
export type UpdateInterviewInput = Parameters<typeof updateInterview>[1];
export type UpdateInterviewOutput = Awaited<ReturnType<typeof updateInterview>>;
export type UpdateInterviewDto = UpdateInterviewInput;
export { updateInterview };

export type DeleteInterviewInput = Parameters<typeof deleteInterview>[0];
export type DeleteInterviewOutput = Awaited<ReturnType<typeof deleteInterview>>;
export type DeletedInterview = DeleteInterviewOutput["data"];
export { deleteInterview };

export type GetSharedInterviewInput = Parameters<typeof getSharedInterview>[0];
export type GetSharedInterviewOutput = Awaited<
	ReturnType<typeof getSharedInterview>
>;
export type SharedInterviewPreview = GetSharedInterviewOutput["data"];
export type SharedInterviewPreviewResponseDto = SharedInterviewPreview;
export { getSharedInterview };
