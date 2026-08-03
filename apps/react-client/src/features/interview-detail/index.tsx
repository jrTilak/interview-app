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
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { AttemptHistoryTable } from "@/components/molecules/attempt-history-table";
import { interviewParticipantAttemptsQueryOptions } from "@/shared/api/modules/attempts/queries";
import { interviewDetailQueryOptions } from "@/shared/api/modules/interviews/queries";
import { copyText } from "@/shared/lib/copy-text";
import { formatDate, formatDuration } from "@/shared/lib/format";
import { parseError } from "@/shared/lib/parse-error";
import { getInterviewShareUrl } from "@/shared/lib/share-url";
import { toaster } from "@/shared/lib/toaster";

/** Shows the creator-only structured question set and its candidate link. */
export function InterviewDetailScreen({
	interviewId,
}: {
	interviewId: string;
}) {
	const interview = useQuery(interviewDetailQueryOptions(interviewId));
	const participantAttempts = useQuery(
		interviewParticipantAttemptsQueryOptions(interviewId),
	);

	if (interview.isPending) {
		return (
			<CreatorAppShell>
				<LoadingState label="Loading interview" />
			</CreatorAppShell>
		);
	}

	if (interview.isError) {
		return (
			<CreatorAppShell>
				<ErrorState
					description={parseError(
						interview.error,
						"This interview could not be loaded.",
					)}
					onRetry={() => void interview.refetch()}
					title="Interview unavailable"
				/>
			</CreatorAppShell>
		);
	}

	const detail = interview.data;
	const shareUrl = getInterviewShareUrl(detail.shareCode);
	const copyLink = async () => {
		try {
			await copyText(shareUrl);
			toaster.success({ title: "Candidate link copied" });
		} catch (error) {
			toaster.error({
				description: parseError(error, "Copy the link manually."),
				title: "Clipboard unavailable",
			});
		}
	};

	return (
		<CreatorAppShell>
			<ChakraLink asChild color="muted" display="inline-flex" fontSize="sm">
				<Link to="/dashboard">
					<ArrowLeft aria-hidden="true" size={15} />
					Back to interviews
				</Link>
			</ChakraLink>
			<Flex align="flex-end" gap="8" justify="space-between" mt="7">
				<Box maxW="4xl">
					<Text
						color="cobalt"
						fontFamily="mono"
						fontSize="xs"
						fontWeight="700"
						letterSpacing="0.1em"
					>
						STRUCTURED INTERVIEW
					</Text>
					<Heading
						fontFamily="display"
						fontSize="4xl"
						letterSpacing="-0.035em"
						mt="2"
					>
						{detail.title}
					</Heading>
					{detail.description && (
						<Text color="muted" fontSize="lg" lineHeight="1.6" mt="3">
							{detail.description}
						</Text>
					)}
				</Box>
				<Grid
					borderColor="line"
					borderLeftWidth="1px"
					gap="4"
					minW="250px"
					pl="6"
					templateColumns="1fr 1fr"
				>
					<Meta
						label="Duration"
						value={formatDuration(detail.durationMinutes)}
					/>
					<Meta label="Questions" value={String(detail.questionCount)} />
					<Meta label="Created" value={formatDate(detail.createdAt)} />
					<Meta
						label="Attempt policy"
						value={detail.allowMultipleAttempts ? "Repeat allowed" : "One each"}
					/>
				</Grid>
			</Flex>

			<Grid
				alignItems="center"
				bg="forest"
				color="paper"
				gap="5"
				mt="10"
				p="5"
				templateColumns="auto minmax(0, 1fr) auto auto"
			>
				<Text color="accent" fontFamily="mono" fontSize="xs" fontWeight="700">
					CANDIDATE LINK
				</Text>
				<Text fontFamily="mono" fontSize="sm" truncate>
					{shareUrl}
				</Text>
				<Button color="paper" onClick={() => void copyLink()} variant="outline">
					<Copy aria-hidden="true" size={16} />
					Copy
				</Button>
				<Button asChild bg="accent" color="forest">
					<a href={shareUrl} rel="noreferrer" target="_blank">
						Preview
						<ExternalLink aria-hidden="true" size={16} />
					</a>
				</Button>
			</Grid>

			<Box mt="12">
				<Flex align="baseline" justify="space-between">
					<Box>
						<Heading fontFamily="display" fontSize="2xl">
							Participant attempts
						</Heading>
						<Text color="muted" fontSize="sm" mt="1">
							Candidate identity, live state, question progress, and timing.
						</Text>
					</Box>
					<Text color="muted" fontFamily="mono" fontSize="xs">
						{detail.allowMultipleAttempts
							? "REPEAT ATTEMPTS ENABLED"
							: "ONE ATTEMPT PER CANDIDATE"}
					</Text>
				</Flex>
				<Box mt="5">
					{participantAttempts.isPending && (
						<LoadingState label="Loading participant attempts" />
					)}
					{participantAttempts.isError && (
						<ErrorState
							description={parseError(
								participantAttempts.error,
								"Participant attempts could not be loaded.",
							)}
							onRetry={() => void participantAttempts.refetch()}
							title="Attempts unavailable"
						/>
					)}
					{participantAttempts.data && (
						<AttemptHistoryTable
							emptyMessage="No candidate has started this interview yet."
							rows={participantAttempts.data.map((attempt) => ({
								...attempt,
								primary: attempt.candidate.name,
								secondary: attempt.candidate.email,
							}))}
						/>
					)}
				</Box>
			</Box>

			<Box mt="12">
				<Flex align="baseline" justify="space-between">
					<Heading fontFamily="display" fontSize="2xl">
						Structured question set
					</Heading>
					<Text color="muted" fontFamily="mono" fontSize="xs">
						PRIVATE TO CREATOR
					</Text>
				</Flex>
				<Stack borderColor="line" borderTopWidth="1px" gap="0" mt="5">
					{detail.questions.map((question) => (
						<Grid
							borderBottomColor="line"
							borderBottomWidth="1px"
							gap="6"
							key={question.id}
							py="6"
							templateColumns="56px minmax(220px, 0.75fr) minmax(0, 1.7fr)"
						>
							<Text color="cobalt" fontFamily="mono" fontSize="sm">
								{String(question.position).padStart(2, "0")}
							</Text>
							<Box>
								<Text fontWeight="700">{question.title}</Text>
								{question.objective && (
									<Text color="muted" fontSize="sm" mt="2">
										Objective · {question.objective}
									</Text>
								)}
							</Box>
							<Box>
								<Text lineHeight="1.6">{question.prompt}</Text>
								{question.followUpGuidance && (
									<Text color="muted" fontSize="sm" mt="3">
										Follow-up · {question.followUpGuidance}
									</Text>
								)}
							</Box>
						</Grid>
					))}
				</Stack>
			</Box>

			<Box
				as="details"
				borderBottomColor="line"
				borderBottomWidth="1px"
				borderTopColor="line"
				borderTopWidth="1px"
				mt="12"
				py="5"
			>
				<Box
					as="summary"
					cursor="pointer"
					fontFamily="display"
					fontSize="lg"
					fontWeight="700"
				>
					Original question notes
				</Box>
				<Text
					bg="surface"
					fontFamily="mono"
					fontSize="sm"
					lineHeight="1.7"
					mt="5"
					p="5"
					whiteSpace="pre-wrap"
				>
					{detail.rawQuestions}
				</Text>
			</Box>
		</CreatorAppShell>
	);
}

function Meta({ label, value }: { label: string; value: string }) {
	return (
		<Box>
			<Text color="muted" fontFamily="mono" fontSize="2xs">
				{label.toUpperCase()}
			</Text>
			<Text fontSize="sm" fontWeight="700" mt="1">
				{value}
			</Text>
		</Box>
	);
}
