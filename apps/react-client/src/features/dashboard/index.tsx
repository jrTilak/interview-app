import {
	Box,
	Button,
	Link as ChakraLink,
	Flex,
	Grid,
	Heading,
	Stack,
	Text,
} from "@chakra-ui/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Copy, FilePlus2 } from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { AttemptHistoryTable } from "@/components/molecules/attempt-history-table";
import { PageHeader } from "@/components/molecules/page-header";
import {
	attemptHistoryQueryOptions,
	interviewParticipantAttemptsQueryOptions,
} from "@/shared/api/modules/attempts/queries";
import { interviewListQueryOptions } from "@/shared/api/modules/interviews/queries";
import { copyText } from "@/shared/lib/copy-text";
import { formatDate, formatDuration } from "@/shared/lib/format";
import { parseError } from "@/shared/lib/parse-error";
import { getInterviewShareUrl } from "@/shared/lib/share-url";
import { toaster } from "@/shared/lib/toaster";

/** Lists creator-owned interviews as a dense, reusable workspace table. */
export function DashboardScreen() {
	const interviews = useQuery(interviewListQueryOptions());
	const attemptHistory = useQuery(attemptHistoryQueryOptions());
	const participantAttempts = useQueries({
		queries: (interviews.data ?? []).map((interview) =>
			interviewParticipantAttemptsQueryOptions(interview.id),
		),
	});

	const copyLink = async (shareUrl: string) => {
		try {
			await copyText(shareUrl);
			toaster.success({ title: "Interview link copied" });
		} catch (error) {
			toaster.error({
				description: parseError(error, "Copy the link manually."),
				title: "Clipboard unavailable",
			});
		}
	};

	return (
		<CreatorAppShell>
			<PageHeader
				action={
					<Button asChild bg="forest" color="paper" h="11" px="5">
						<Link to="/interviews/new">
							<FilePlus2 aria-hidden="true" size={17} />
							Create interview
						</Link>
					</Button>
				}
				description="Create interview sets, track participants, and revisit interviews you have taken."
				eyebrow="Interview library"
				title="Your interviews"
			/>

			<Box mt="10">
				{interviews.isPending && <LoadingState label="Loading interviews" />}
				{interviews.isError && (
					<ErrorState
						description={parseError(
							interviews.error,
							"The interview list could not be loaded.",
						)}
						onRetry={() => void interviews.refetch()}
					/>
				)}
				{interviews.data?.length === 0 && (
					<Box borderColor="line" borderTopWidth="1px" py="14">
						<Text color="cobalt" fontFamily="mono" fontSize="xs">
							NO INTERVIEWS YET
						</Text>
						<Heading fontFamily="display" fontSize="3xl" mt="3">
							Start with your raw question notes.
						</Heading>
						<Text color="muted" maxW="xl" mt="2">
							The AI structures them into an ordered interview while keeping the
							original notes private.
						</Text>
						<Button asChild mt="6" variant="outline">
							<Link to="/interviews/new">Create the first interview</Link>
						</Button>
					</Box>
				)}
				{interviews.data && interviews.data.length > 0 && (
					<Box borderColor="line" borderTopWidth="1px">
						<Grid
							color="muted"
							fontFamily="mono"
							fontSize="xs"
							gap="5"
							px="4"
							py="3"
							templateColumns="minmax(220px, 1.5fr) 96px 84px 148px 104px 116px"
							textTransform="uppercase"
						>
							<Text>Interview</Text>
							<Text>Questions</Text>
							<Text>Duration</Text>
							<Text>Attempt policy</Text>
							<Text>Created</Text>
							<Text textAlign="right">Actions</Text>
						</Grid>
						{interviews.data.map((interview) => (
							<Grid
								_hover={{ bg: "surface" }}
								alignItems="center"
								borderBottomColor="line"
								borderBottomWidth="1px"
								gap="5"
								key={interview.id}
								minH="20"
								px="4"
								templateColumns="minmax(220px, 1.5fr) 96px 84px 148px 104px 116px"
							>
								<Box minW="0">
									<ChakraLink asChild fontWeight="700">
										<Link
											params={{ interviewId: interview.id }}
											to="/interviews/owned/$interviewId"
										>
											{interview.title}
										</Link>
									</ChakraLink>
									<Text color="muted" fontSize="sm" mt="1" truncate>
										{interview.description || "No description"}
									</Text>
								</Box>
								<Text fontFamily="mono" fontSize="sm">
									{interview.questionCount}
								</Text>
								<Text fontFamily="mono" fontSize="sm">
									{formatDuration(interview.durationMinutes)}
								</Text>
								<Text color="muted" fontSize="sm">
									{interview.allowMultipleAttempts
										? "Repeat allowed"
										: "One each"}
								</Text>
								<Text color="muted" fontSize="sm">
									{formatDate(interview.createdAt)}
								</Text>
								<Flex justify="flex-end">
									<Button
										aria-label={`Copy link for ${interview.title}`}
										onClick={() =>
											void copyLink(getInterviewShareUrl(interview.shareCode))
										}
										size="sm"
										variant="ghost"
									>
										<Copy aria-hidden="true" size={16} />
									</Button>
									<Button asChild size="sm" variant="ghost">
										<Link
											aria-label={`Open ${interview.title}`}
											params={{ interviewId: interview.id }}
											to="/interviews/owned/$interviewId"
										>
											<ArrowUpRight aria-hidden="true" size={17} />
										</Link>
									</Button>
								</Flex>
							</Grid>
						))}
					</Box>
				)}
			</Box>

			{interviews.data && interviews.data.length > 0 && (
				<Box mt="16">
					<Flex align="baseline" justify="space-between">
						<Box>
							<Text color="cobalt" fontFamily="mono" fontSize="xs">
								CREATOR VIEW
							</Text>
							<Heading fontFamily="display" fontSize="3xl" mt="2">
								Participant activity
							</Heading>
						</Box>
						<Text color="muted" fontSize="sm">
							All candidates and attempts across your interviews.
						</Text>
					</Flex>

					<Stack gap="10" mt="6">
						{interviews.data.map((interview, index) => {
							const attempts = participantAttempts[index];
							return (
								<Box key={interview.id}>
									<Grid
										alignItems="end"
										borderColor="line"
										borderTopWidth="1px"
										gap="8"
										py="5"
										templateColumns="minmax(0, 1fr) auto auto"
									>
										<Box minW="0">
											<Heading fontFamily="display" fontSize="xl">
												{interview.title}
											</Heading>
											<Text color="muted" fontSize="sm" mt="1">
												{attempts?.data?.length ?? 0}{" "}
												{attempts?.data?.length === 1 ? "attempt" : "attempts"}
											</Text>
										</Box>
										<Text color="muted" fontSize="sm">
											{interview.allowMultipleAttempts
												? "Repeat attempts allowed"
												: "One attempt per candidate"}
										</Text>
										<Button asChild size="sm" variant="outline">
											<Link
												params={{ interviewId: interview.id }}
												to="/interviews/owned/$interviewId"
											>
												Open interview
											</Link>
										</Button>
									</Grid>
									{attempts?.isPending && (
										<LoadingState
											label={`Loading attempts for ${interview.title}`}
										/>
									)}
									{attempts?.isError && (
										<ErrorState
											description={parseError(
												attempts.error,
												`Attempts for ${interview.title} could not be loaded.`,
											)}
											onRetry={() => void attempts.refetch()}
											title="Attempts unavailable"
										/>
									)}
									{attempts?.data && (
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
							);
						})}
					</Stack>
				</Box>
			)}

			<Box mt="16">
				<Flex align="baseline" justify="space-between">
					<Box>
						<Text color="cobalt" fontFamily="mono" fontSize="xs">
							CANDIDATE HISTORY
						</Text>
						<Heading fontFamily="display" fontSize="3xl" mt="2">
							Interviews you have taken
						</Heading>
					</Box>
					<Text color="muted" fontSize="sm">
						Every attempt is kept under its interview.
					</Text>
				</Flex>

				<Box mt="6">
					{attemptHistory.isPending && (
						<LoadingState label="Loading attempt history" />
					)}
					{attemptHistory.isError && (
						<ErrorState
							description={parseError(
								attemptHistory.error,
								"Your interview history could not be loaded.",
							)}
							onRetry={() => void attemptHistory.refetch()}
							title="History unavailable"
						/>
					)}
					{attemptHistory.data?.length === 0 && (
						<Box borderColor="line" borderTopWidth="1px" py="10">
							<Text color="muted">
								Interviews you join will appear here with each attempt.
							</Text>
						</Box>
					)}
					{attemptHistory.data && attemptHistory.data.length > 0 && (
						<Stack gap="10">
							{attemptHistory.data.map((history) => (
								<Box key={history.interview.id}>
									<Grid
										alignItems="end"
										borderColor="line"
										borderTopWidth="1px"
										gap="8"
										py="5"
										templateColumns="minmax(0, 1fr) auto auto"
									>
										<Box minW="0">
											<Heading fontFamily="display" fontSize="xl">
												{history.interview.title}
											</Heading>
											<Text color="muted" fontSize="sm" mt="1" truncate>
												{history.interview.description || "No description"}
											</Text>
										</Box>
										<Box textAlign="right">
											<Text fontFamily="mono" fontSize="xs">
												{formatDuration(history.interview.durationMinutes)} ·{" "}
												{history.attempts.length}{" "}
												{history.attempts.length === 1 ? "attempt" : "attempts"}
											</Text>
											<Text color="muted" fontSize="xs" mt="1">
												{history.interview.allowMultipleAttempts
													? "Repeat attempts allowed"
													: "One attempt per candidate"}
											</Text>
										</Box>
										<Button asChild size="sm" variant="outline">
											<Link
												params={{ shareCode: history.interview.shareCode }}
												to="/interviews/$shareCode"
											>
												View interview
											</Link>
										</Button>
									</Grid>
									<AttemptHistoryTable
										emptyMessage="No attempts have been recorded."
										rows={history.attempts.map((attempt, index) => ({
											...attempt,
											primary: `Attempt ${history.attempts.length - index}`,
										}))}
									/>
								</Box>
							))}
						</Stack>
					)}
				</Box>
			</Box>
		</CreatorAppShell>
	);
}
