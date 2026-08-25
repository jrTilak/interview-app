import {
	interviewAttemptsControllerFindSnapshot as getAttempt,
	interviewAttemptsControllerCreateOrResume as joinInterview,
	interviewAttemptsControllerFindAllHistory as listAttemptHistory,
	interviewAttemptsControllerFindAttempts as listInterviewParticipantAttempts,
} from "@/shared/api/generated/application/interview-attempts/interview-attempts";

export type JoinInterviewInput = Parameters<typeof joinInterview>[0];
export type JoinInterviewOutput = Awaited<ReturnType<typeof joinInterview>>;
export { joinInterview };

export type GetAttemptInput = Parameters<typeof getAttempt>[0];
export type GetAttemptOutput = Awaited<ReturnType<typeof getAttempt>>;
export type AttemptSnapshot = GetAttemptOutput["data"];
export type AttemptSnapshotResponseDto = AttemptSnapshot;
export { getAttempt };

export type ListAttemptHistoryOutput = Awaited<
	ReturnType<typeof listAttemptHistory>
>;
export type CandidateInterviewHistory =
	ListAttemptHistoryOutput["data"][number];
export type CandidateInterviewHistoryResponseDto = CandidateInterviewHistory;
export { listAttemptHistory };

export type ListInterviewParticipantAttemptsInput = Parameters<
	typeof listInterviewParticipantAttempts
>[0];
export type ListInterviewParticipantAttemptsOutput = Awaited<
	ReturnType<typeof listInterviewParticipantAttempts>
>;
export type CreatorAttemptHistory =
	ListInterviewParticipantAttemptsOutput["data"][number];
export type CreatorAttemptHistoryResponseDto = CreatorAttemptHistory;
export { listInterviewParticipantAttempts };
