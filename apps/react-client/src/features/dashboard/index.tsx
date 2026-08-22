import {
	Box,
	Button,
	Flex,
	Grid,
	Heading,
	Stack,
	Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Link2 } from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { AttemptHistoryTable } from "@/components/molecules/attempt-history-table";
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
					<Button asChild bg="forest" color="paper">
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
					<Flex
						align="center"
						bg="surface"
						borderColor="line"
						borderRadius="xl"
						borderWidth="1px"
						direction="column"
						justify="center"
						minH="320px"
						p="10"
						textAlign="center"
					>
						<Flex
							align="center"
							bg="softAccent"
							color="cobalt"
							h="12"
							justify="center"
							w="12"
						>
							<Link2 aria-hidden="true" size={21} />
						</Flex>
						<Heading fontFamily="display" fontSize="2xl" mt="5">
							No interviews yet
						</Heading>
						<Text color="muted" fontSize="sm" mt="2">
							Paste a recruiter link to begin.
						</Text>
						<Button asChild mt="5" variant="outline">
							<Link to="/join">Enter a link</Link>
						</Button>
					</Flex>
				)}
				{history.data && history.data.length > 0 && (
					<Stack gap="5">
						{history.data.map((item) => {
							const latest = item.attempts[0];
							return (
								<Box
									bg="surface"
									borderColor="line"
									borderRadius="xl"
									borderWidth="1px"
									key={item.interview.id}
									p="6"
								>
									<Grid
										alignItems="center"
										gap="6"
										templateColumns="minmax(0, 1fr) auto auto"
									>
										<Box minW="0">
											<Heading fontFamily="display" fontSize="xl">
												{item.interview.title}
											</Heading>
											<Text color="muted" fontSize="sm" mt="1" truncate>
												{item.interview.description || "Interview"}
											</Text>
										</Box>
										<Box textAlign="right">
											<Text fontSize="sm" fontWeight="700">
												{latest?.state.replaceAll("_", " ") ?? "Ready"}
											</Text>
											<Text color="muted" fontSize="xs">
												{formatDuration(item.interview.durationMinutes)} ·{" "}
												{item.attempts.length}{" "}
												{item.attempts.length === 1 ? "attempt" : "attempts"}
											</Text>
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
								</Box>
							);
						})}
					</Stack>
				)}
			</Box>
		</CreatorAppShell>
	);
}
