import {
	Accordion,
	Box,
	Button,
	Link as ChakraLink,
	Clipboard,
	DataList,
	Dialog,
	Flex,
	Grid,
	Heading,
	Portal,
	Stack,
	Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { AttemptHistoryTable } from "@/components/molecules/attempt-history-table";
import { interviewParticipantAttemptsQueryOptions } from "@/shared/api/modules/attempts/queries";
import { useDeleteInterview } from "@/shared/api/modules/interviews/hooks";
import { interviewDetailQueryOptions } from "@/shared/api/modules/interviews/queries";
import { formatDate, formatDuration } from "@/shared/lib/format";
import { parseError } from "@/shared/lib/parse-error";
import { getInterviewShareUrl } from "@/shared/lib/share-url";
import { toaster } from "@/shared/lib/toaster";

/** Shows the creator-only topic plan and its candidate link. */
export function InterviewDetailScreen({
	interviewId,
}: {
	interviewId: string;
}) {
	const interview = useQuery(interviewDetailQueryOptions(interviewId));
	const participantAttempts = useQuery(
		interviewParticipantAttemptsQueryOptions(interviewId),
	);
	const deleteInterview = useDeleteInterview();
	const router = useRouter();

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
	const remove = async () => {
		try {
			await deleteInterview.mutateAsync(detail.id);
			toaster.success({ title: "Interview deleted" });
			await router.navigate({ to: "/recruiter/interviews" });
		} catch (error) {
			toaster.error({
				description: parseError(error, "This interview could not be deleted."),
				title: "Delete failed",
			});
		}
	};

	return (
		<CreatorAppShell>
			<ChakraLink asChild color="muted" display="inline-flex" fontSize="sm">
				<Link to="/recruiter/interviews">
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
					<Heading fontSize="4xl" mt="2">
						{detail.title}
					</Heading>
					{detail.description && (
						<Text color="muted" fontSize="lg" lineHeight="1.6" mt="3">
							{detail.description}
						</Text>
					)}
				</Box>
				<Box borderColor="line" borderLeftWidth="1px" minW="270px" pl="6">
					<DataList.Root display="grid" gap="4" gridTemplateColumns="1fr 1fr">
						<InterviewFact
							label="Duration"
							value={formatDuration(detail.durationMinutes)}
						/>
						<InterviewFact
							label="Topics"
							value={String(detail.questionCount)}
						/>
						<InterviewFact
							label="Created"
							value={formatDate(detail.createdAt)}
						/>
						<InterviewFact
							label="Attempt policy"
							value={
								detail.allowMultipleAttempts ? "Repeat allowed" : "One each"
							}
						/>
					</DataList.Root>
					<Flex gap="2" mt="5">
						<Button asChild flex="1" size="sm" variant="outline">
							<Link
								params={{ interviewId: detail.id }}
								to="/interviews/owned/$interviewId/edit"
							>
								<Pencil aria-hidden="true" size={14} /> Edit
							</Link>
						</Button>
						<Dialog.Root role="alertdialog" size="sm">
							<Dialog.Trigger asChild>
								<Button colorPalette="red" size="sm" variant="ghost">
									<Trash2 aria-hidden="true" size={14} /> Delete
								</Button>
							</Dialog.Trigger>
							<Portal>
								<Dialog.Backdrop />
								<Dialog.Positioner>
									<Dialog.Content>
										<Dialog.Header>
											<Dialog.Title>Delete interview?</Dialog.Title>
										</Dialog.Header>
										<Dialog.Body>
											<Dialog.Description>
												“{detail.title}” will be permanently deleted. Interviews
												with attempts remain protected.
											</Dialog.Description>
										</Dialog.Body>
										<Dialog.Footer>
											<Dialog.ActionTrigger asChild>
												<Button
													disabled={deleteInterview.isPending}
													variant="outline"
												>
													Cancel
												</Button>
											</Dialog.ActionTrigger>
											<Button
												colorPalette="red"
												loading={deleteInterview.isPending}
												onClick={() => void remove()}
											>
												Delete interview
											</Button>
										</Dialog.Footer>
									</Dialog.Content>
								</Dialog.Positioner>
							</Portal>
						</Dialog.Root>
					</Flex>
				</Box>
			</Flex>

			<Clipboard.Root
				alignItems="center"
				display="grid"
				gap="5"
				layerStyle="panel-inverted"
				mt="10"
				onStatusChange={({ copied }) => {
					if (copied) toaster.success({ title: "Candidate link copied" });
				}}
				p="5"
				gridTemplateColumns="auto minmax(0, 1fr) auto auto"
				value={shareUrl}
			>
				<Clipboard.Label
					color="accent"
					fontFamily="mono"
					fontSize="xs"
					fontWeight="700"
				>
					CANDIDATE LINK
				</Clipboard.Label>
				<Clipboard.ValueText fontFamily="mono" fontSize="sm" truncate />
				<Clipboard.Trigger asChild>
					<Button colorPalette="inverse" variant="outline">
						<Copy aria-hidden="true" size={16} />
						Copy
					</Button>
				</Clipboard.Trigger>
				<Button asChild colorPalette="highlight">
					<a href={shareUrl} rel="noreferrer" target="_blank">
						Preview
						<ExternalLink aria-hidden="true" size={16} />
					</a>
				</Button>
			</Clipboard.Root>

			<Box mt="12">
				<Flex align="baseline" justify="space-between">
					<Box>
						<Heading fontSize="2xl">Participant attempts</Heading>
						<Text color="muted" fontSize="sm" mt="1">
							Candidate identity, live state, topic progress, and timing.
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
					<Heading fontSize="2xl">Interview topics</Heading>
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

			<Accordion.Root collapsible mt="12">
				<Accordion.Item value="original-notes">
					<Accordion.ItemTrigger>
						<Text flex="1" fontFamily="display" fontSize="lg" fontWeight="700">
							Original topic notes
						</Text>
						<Accordion.ItemIndicator />
					</Accordion.ItemTrigger>
					<Accordion.ItemContent>
						<Accordion.ItemBody>
							<Text
								bg="bg.panel"
								fontFamily="mono"
								fontSize="sm"
								lineHeight="1.7"
								p="5"
								whiteSpace="pre-wrap"
							>
								{detail.rawQuestions}
							</Text>
						</Accordion.ItemBody>
					</Accordion.ItemContent>
				</Accordion.Item>
			</Accordion.Root>
		</CreatorAppShell>
	);
}

function InterviewFact({ label, value }: { label: string; value: string }) {
	return (
		<DataList.Item>
			<DataList.ItemLabel>{label}</DataList.ItemLabel>
			<DataList.ItemValue>{value}</DataList.ItemValue>
		</DataList.Item>
	);
}
