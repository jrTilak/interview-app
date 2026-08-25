import {
	Badge,
	Box,
	Button,
	Card,
	EmptyState,
	Flex,
	Grid,
	IconButton,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ArrowUpRight,
	Clock3,
	Copy,
	FilePlus2,
	ListChecks,
} from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/molecules/page-header";
import { interviewListQueryOptions } from "@/shared/api/modules/interviews/queries";
import { copyText } from "@/shared/lib/copy-text";
import { formatDuration } from "@/shared/lib/format";
import { parseError } from "@/shared/lib/parse-error";
import { getInterviewShareUrl } from "@/shared/lib/share-url";
import { toaster } from "@/shared/lib/toaster";

/** Lists only recruiter-owned interview definitions. */
export function RecruiterInterviewsScreen() {
	const interviews = useQuery(interviewListQueryOptions());

	const copyLink = async (shareCode: string) => {
		try {
			await copyText(getInterviewShareUrl(shareCode));
			toaster.success({ title: "Link copied" });
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
					<Button asChild>
						<Link to="/interviews/new">
							<FilePlus2 aria-hidden="true" size={16} /> New interview
						</Link>
					</Button>
				}
				description="Create, share, and manage interview plans."
				eyebrow="Recruiter mode"
				title="Interviews"
			/>

			<Box mt="8">
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
					<EmptyState.Root minH="320px">
						<EmptyState.Content>
							<EmptyState.Indicator>
								<FilePlus2 aria-hidden="true" />
							</EmptyState.Indicator>
							<EmptyState.Title>Create your first interview</EmptyState.Title>
							<Button asChild variant="outline">
								<Link to="/interviews/new">Get started</Link>
							</Button>
						</EmptyState.Content>
					</EmptyState.Root>
				)}
				{interviews.data && interviews.data.length > 0 && (
					<Grid gap="5" templateColumns="repeat(2, minmax(0, 1fr))">
						{interviews.data.map((interview) => (
							<Card.Root key={interview.id}>
								<Card.Header>
									<Flex align="start" gap="4" justify="space-between">
										<Box minW="0">
											<Card.Title truncate>{interview.title}</Card.Title>
											<Card.Description mt="1" truncate>
												{interview.description || "No description"}
											</Card.Description>
										</Box>
										<IconButton
											aria-label={`Copy link for ${interview.title}`}
											onClick={() => void copyLink(interview.shareCode)}
											size="sm"
											variant="ghost"
										>
											<Copy aria-hidden="true" size={16} />
										</IconButton>
									</Flex>
								</Card.Header>
								<Card.Body>
									<Flex gap="2">
										<Badge variant="outline">
											<ListChecks aria-hidden="true" size={15} />
											{interview.questionCount} topics
										</Badge>
										<Badge variant="outline">
											<Clock3 aria-hidden="true" size={15} />
											{formatDuration(interview.durationMinutes)}
										</Badge>
									</Flex>
								</Card.Body>
								<Card.Footer justifyContent="space-between">
									<Badge
										colorPalette={
											interview.allowMultipleAttempts ? "brand" : "gray"
										}
									>
										{interview.allowMultipleAttempts
											? "Repeat attempts"
											: "Single attempt"}
									</Badge>
									<Button asChild size="sm" variant="outline">
										<Link
											params={{ interviewId: interview.id }}
											to="/interviews/owned/$interviewId"
										>
											Manage <ArrowUpRight aria-hidden="true" size={15} />
										</Link>
									</Button>
								</Card.Footer>
							</Card.Root>
						))}
					</Grid>
				)}
			</Box>
		</CreatorAppShell>
	);
}
