import { Badge, Box, Card, EmptyState, Flex, Stack } from "@chakra-ui/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { AttemptHistoryTable } from "@/components/molecules/attempt-history-table";
import { PageHeader } from "@/components/molecules/page-header";
import { interviewParticipantAttemptsQueryOptions } from "@/shared/api/modules/attempts/queries";
import { interviewListQueryOptions } from "@/shared/api/modules/interviews/queries";
import { parseError } from "@/shared/lib/parse-error";

/** Separates participant activity from interview definition management. */
export function RecruiterParticipantsScreen() {
	const interviews = useQuery(interviewListQueryOptions());
	const attempts = useQueries({
		queries: (interviews.data ?? []).map((interview) =>
			interviewParticipantAttemptsQueryOptions(interview.id),
		),
	});

	return (
		<CreatorAppShell>
			<PageHeader
				description="Candidate activity across your interview links."
				eyebrow="Recruiter mode"
				title="Participants"
			/>
			<Box mt="8">
				{interviews.isPending && <LoadingState label="Loading participants" />}
				{interviews.isError && (
					<ErrorState
						description={parseError(
							interviews.error,
							"Participants could not be loaded.",
						)}
						onRetry={() => void interviews.refetch()}
					/>
				)}
				{interviews.data?.length === 0 && (
					<EmptyState.Root minH="260px">
						<EmptyState.Content>
							<EmptyState.Indicator>
								<UsersRound aria-hidden="true" />
							</EmptyState.Indicator>
							<EmptyState.Title>No interview activity yet.</EmptyState.Title>
						</EmptyState.Content>
					</EmptyState.Root>
				)}
				{interviews.data && interviews.data.length > 0 && (
					<Stack gap="6">
						{interviews.data.map((interview, index) => {
							const result = attempts[index];
							return (
								<Card.Root key={interview.id}>
									<Card.Header>
										<Flex align="baseline" justify="space-between">
											<Card.Title>{interview.title}</Card.Title>
											<Badge variant="outline">
												{result?.data?.length ?? 0} attempts
											</Badge>
										</Flex>
									</Card.Header>
									<Card.Body>
										{result?.isPending && (
											<LoadingState label="Loading attempts" />
										)}
										{result?.isError && (
											<ErrorState
												description="Attempts could not be loaded."
												onRetry={() => void result.refetch()}
											/>
										)}
										{result?.data && (
											<AttemptHistoryTable
												emptyMessage="No candidate has started this interview."
												rows={result.data.map((attempt) => ({
													...attempt,
													primary: attempt.candidate.name,
													secondary: attempt.candidate.email,
												}))}
											/>
										)}
									</Card.Body>
								</Card.Root>
							);
						})}
					</Stack>
				)}
			</Box>
		</CreatorAppShell>
	);
}
