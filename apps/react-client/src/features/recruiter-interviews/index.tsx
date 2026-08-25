import {
	Box,
	Button,
	Flex,
	Grid,
	Heading,
	IconButton,
	Text,
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
					<Button asChild bg="forest" color="paper">
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
					>
						<Heading fontFamily="display" fontSize="2xl">
							Create your first interview
						</Heading>
						<Button asChild mt="5" variant="outline">
							<Link to="/interviews/new">Get started</Link>
						</Button>
					</Flex>
				)}
				{interviews.data && interviews.data.length > 0 && (
					<Grid gap="5" templateColumns="repeat(2, minmax(0, 1fr))">
						{interviews.data.map((interview) => (
							<Box
								_hover={{
									borderColor: "cobalt",
									transform: "translateY(-2px)",
								}}
								bg="surface"
								borderColor="line"
								borderRadius="xl"
								borderWidth="1px"
								key={interview.id}
								p="6"
								transition="all 150ms ease"
							>
								<Flex align="start" gap="4" justify="space-between">
									<Box minW="0">
										<Heading fontFamily="display" fontSize="xl" truncate>
											{interview.title}
										</Heading>
										<Text color="muted" fontSize="sm" mt="1" truncate>
											{interview.description || "No description"}
										</Text>
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
								<Flex color="muted" fontSize="sm" gap="5" mt="6">
									<Flex align="center" gap="2">
										<ListChecks aria-hidden="true" size={15} />
										{interview.questionCount} topics
									</Flex>
									<Flex align="center" gap="2">
										<Clock3 aria-hidden="true" size={15} />
										{formatDuration(interview.durationMinutes)}
									</Flex>
								</Flex>
								<Flex align="center" justify="space-between" mt="7">
									<Text color="muted" fontSize="xs">
										{interview.allowMultipleAttempts
											? "Repeat attempts"
											: "Single attempt"}
									</Text>
									<Button asChild size="sm" variant="outline">
										<Link
											params={{ interviewId: interview.id }}
											to="/interviews/owned/$interviewId"
										>
											Manage <ArrowUpRight aria-hidden="true" size={15} />
										</Link>
									</Button>
								</Flex>
							</Box>
						))}
					</Grid>
				)}
			</Box>
		</CreatorAppShell>
	);
}
