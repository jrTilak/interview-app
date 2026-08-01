import {
	Box,
	Button,
	Link as ChakraLink,
	Flex,
	Grid,
	Heading,
	Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Copy, FilePlus2 } from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/molecules/page-header";
import { interviewListQueryOptions } from "@/shared/api/modules/interviews/queries";
import { copyText } from "@/shared/lib/copy-text";
import { formatDate, formatDuration } from "@/shared/lib/format";
import { parseError } from "@/shared/lib/parse-error";
import { getInterviewShareUrl } from "@/shared/lib/share-url";
import { toaster } from "@/shared/lib/toaster";

/** Lists creator-owned interviews as a dense, reusable workspace table. */
export function DashboardScreen() {
	const interviews = useQuery(interviewListQueryOptions());

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
				description="Build a question set once, then share its secure link with candidates."
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
							templateColumns="minmax(220px, 1.5fr) 96px 84px 104px 116px"
							textTransform="uppercase"
						>
							<Text>Interview</Text>
							<Text>Questions</Text>
							<Text>Duration</Text>
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
								templateColumns="minmax(220px, 1.5fr) 96px 84px 104px 116px"
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
		</CreatorAppShell>
	);
}
