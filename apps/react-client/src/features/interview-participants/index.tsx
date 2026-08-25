import {
	Badge,
	Box,
	Link as ChakraLink,
	Flex,
	Heading,
	Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { AttemptHistoryTable } from "@/components/molecules/attempt-history-table";
import { interviewParticipantAttemptsQueryOptions } from "@/shared/api/modules/attempts/queries";
import { interviewDetailQueryOptions } from "@/shared/api/modules/interviews/queries";
import { parseError } from "@/shared/lib/parse-error";

/** Shows candidate attempts for one recruiter-owned interview. */
export function InterviewParticipantsScreen({
	interviewId,
}: {
	interviewId: string;
}) {
	const interview = useQuery(interviewDetailQueryOptions(interviewId));
	const attempts = useQuery(
		interviewParticipantAttemptsQueryOptions(interviewId),
	);

	return (
		<CreatorAppShell title="Participant attempts">
			<ChakraLink asChild color="muted" display="inline-flex" fontSize="sm">
				<Link params={{ interviewId }} to="/interviews/owned/$interviewId">
					<ArrowLeft aria-hidden="true" size={15} />
					Back to interview
				</Link>
			</ChakraLink>

			{interview.isPending && <LoadingState label="Loading interview" />}
			{interview.isError && (
				<ErrorState
					description={parseError(
						interview.error,
						"This interview could not be loaded.",
					)}
					onRetry={() => void interview.refetch()}
					title="Interview unavailable"
				/>
			)}

			{interview.data && (
				<>
					<Flex align="flex-end" gap="6" justify="space-between" mt="7">
						<Box>
							<Heading fontSize="3xl">{interview.data.title}</Heading>
							<Text color="muted" mt="2">
								Candidate identity, live state, topic progress, and timing.
							</Text>
						</Box>
						<Badge variant="outline">
							{interview.data.allowMultipleAttempts
								? "Repeat attempts enabled"
								: "One attempt per candidate"}
						</Badge>
					</Flex>

					<Box mt="8">
						{attempts.isPending && (
							<LoadingState label="Loading participant attempts" />
						)}
						{attempts.isError && (
							<ErrorState
								description={parseError(
									attempts.error,
									"Participant attempts could not be loaded.",
								)}
								onRetry={() => void attempts.refetch()}
								title="Attempts unavailable"
							/>
						)}
						{attempts.data && (
							<AttemptHistoryTable
								emptyMessage="No candidate has started this interview yet."
								rows={attempts.data.map((attempt) => ({
									...attempt,
									primary: attempt.candidate.name,
									secondary: attempt.candidate.email,
								}))}
							/>
						)}
					</Box>
				</>
			)}
		</CreatorAppShell>
	);
}
