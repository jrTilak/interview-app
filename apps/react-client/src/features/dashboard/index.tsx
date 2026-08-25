import {
	Box,
	Button,
	Card,
	EmptyState,
	Grid,
	Stack,
	Status,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Link2 } from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import {
	AttemptHistoryTable,
	attemptStatePresentation,
} from "@/components/molecules/attempt-history-table";
import { PageHeader } from "@/components/molecules/page-header";
import { attemptHistoryQueryOptions } from "@/shared/api/modules/attempts/queries";
import { formatDuration } from "@/shared/lib/format";
import { parseError } from "@/shared/lib/parse-error";

/** Shows only the signed-in candidate's interview activity. */
export function DashboardScreen() {
	const history = useQuery(attemptHistoryQueryOptions());

	return (
		<CreatorAppShell>
			<PageHeader
				action={
					<Button asChild>
						<Link to="/join">
							<Link2 aria-hidden="true" size={16} />
							Join interview
						</Link>
					</Button>
				}
				description="Your attempts, progress, and resumable interviews."
				eyebrow="Interview mode"
				title="My interviews"
			/>

			<Box mt="8">
				{history.isPending && <LoadingState label="Loading interviews" />}
				{history.isError && (
					<ErrorState
						description={parseError(
							history.error,
							"Your interview history could not be loaded.",
						)}
						onRetry={() => void history.refetch()}
						title="History unavailable"
					/>
				)}
				{history.data?.length === 0 && (
					<EmptyState.Root minH="320px">
						<EmptyState.Content>
							<EmptyState.Indicator>
								<Link2 aria-hidden="true" size={21} />
							</EmptyState.Indicator>
							<EmptyState.Title>No interviews yet</EmptyState.Title>
							<EmptyState.Description>
								Paste a recruiter link to begin.
							</EmptyState.Description>
							<Button asChild variant="outline">
								<Link to="/join">Enter a link</Link>
							</Button>
						</EmptyState.Content>
					</EmptyState.Root>
				)}
				{history.data && history.data.length > 0 && (
					<Stack gap="5">
						{history.data.map((item) => {
							const latest = item.attempts[0];
							const latestStatus = latest
								? attemptStatePresentation[latest.state]
								: attemptStatePresentation.READY;
							return (
								<Card.Root key={item.interview.id}>
									<Card.Body>
										<Grid
											alignItems="center"
											gap="6"
											templateColumns="minmax(0, 1fr) auto auto"
										>
											<Box minW="0">
												<Card.Title>{item.interview.title}</Card.Title>
												<Card.Description mt="1" truncate>
													{item.interview.description || "Interview"}
												</Card.Description>
											</Box>
											<Box textAlign="right">
												<Status.Root colorPalette={latestStatus.colorPalette}>
													<Status.Indicator />
													{latestStatus.label}
												</Status.Root>
												<Card.Description>
													{formatDuration(item.interview.durationMinutes)} ·{" "}
													{item.attempts.length}{" "}
													{item.attempts.length === 1 ? "attempt" : "attempts"}
												</Card.Description>
											</Box>
											<Button asChild size="sm" variant="outline">
												<Link
													params={{ shareCode: item.interview.shareCode }}
													to="/interviews/$shareCode"
												>
													Open <ArrowUpRight aria-hidden="true" size={15} />
												</Link>
											</Button>
										</Grid>
										<Box mt="5">
											<AttemptHistoryTable
												emptyMessage="No attempts recorded."
												rows={item.attempts.map((attempt, index) => ({
													...attempt,
													primary: `Attempt ${item.attempts.length - index}`,
												}))}
											/>
										</Box>
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
