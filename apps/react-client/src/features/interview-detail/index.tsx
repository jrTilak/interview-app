import {
	Badge,
	Box,
	Button,
	Card,
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
import {
	ArrowLeft,
	Copy,
	ExternalLink,
	Globe2,
	LockKeyhole,
	Trash2,
	UsersRound,
} from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import {
	useDeleteInterview,
	useUpdateInterview,
} from "@/shared/api/modules/interviews/hooks";
import { interviewDetailQueryOptions } from "@/shared/api/modules/interviews/queries";
import { formatDateTime, formatDuration } from "@/shared/lib/format";
import { parseError } from "@/shared/lib/parse-error";
import { getInterviewShareUrl } from "@/shared/lib/share-url";
import { toaster } from "@/shared/lib/toaster";

/** Shows the creator-only interview plan and publication controls. */
export function InterviewDetailScreen({
	interviewId,
}: {
	interviewId: string;
}) {
	const interview = useQuery(interviewDetailQueryOptions(interviewId));
	const updateInterview = useUpdateInterview();
	const deleteInterview = useDeleteInterview();
	const router = useRouter();

	if (interview.isPending) {
		return (
			<CreatorAppShell title="Interview details">
				<LoadingState label="Loading interview" />
			</CreatorAppShell>
		);
	}

	if (interview.isError) {
		return (
			<CreatorAppShell title="Interview details">
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
	const shareUrl = getInterviewShareUrl(detail.id);

	const setPublished = async (isPublic: boolean) => {
		try {
			await updateInterview.mutateAsync({
				id: detail.id,
				data: { isPublic },
			});
			toaster.success({
				title: isPublic ? "Interview published" : "Interview unpublished",
			});
		} catch (error) {
			toaster.error({
				description: parseError(
					error,
					`This interview could not be ${isPublic ? "published" : "unpublished"}.`,
				),
				title: "Visibility update failed",
			});
		}
	};

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
		<CreatorAppShell title="Interview details">
			<ChakraLink asChild color="muted" display="inline-flex" fontSize="sm">
				<Link to="/recruiter/interviews">
					<ArrowLeft aria-hidden="true" size={15} />
					Back to interviews
				</Link>
			</ChakraLink>

			<Grid
				borderColor="line"
				borderWidth="1px"
				mt="6"
				templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) 380px" }}
			>
				<Box p={{ base: "6", xl: "8" }}>
					<Badge
						colorPalette={detail.isPublic ? "green" : "gray"}
						variant="subtle"
					>
						{detail.isPublic ? (
							<Globe2 aria-hidden="true" size={13} />
						) : (
							<LockKeyhole aria-hidden="true" size={13} />
						)}
						{detail.isPublic ? "Published" : "Private"}
					</Badge>
					<Heading as="h2" fontSize={{ base: "3xl", xl: "4xl" }} mt="4">
						{detail.title}
					</Heading>
					<Text color="muted" fontSize="md" lineHeight="1.7" maxW="3xl" mt="3">
						{detail.description ||
							"No description was added for this interview."}
					</Text>
				</Box>

				<Box
					bg="bg.panel"
					borderColor="line"
					borderLeftWidth={{ base: "0", xl: "1px" }}
					borderTopWidth={{ base: "1px", xl: "0" }}
					p={{ base: "6", xl: "8" }}
				>
					<DataList.Root display="grid" gap="6" gridTemplateColumns="1fr 1fr">
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
							value={formatDateTime(detail.createdAt)}
						/>
						<InterviewFact
							label="Attempts"
							value={
								detail.allowMultipleAttempts ? "Repeat allowed" : "One each"
							}
						/>
					</DataList.Root>
				</Box>
			</Grid>

			<Grid
				alignItems="start"
				gap="8"
				mt="8"
				templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) 360px" }}
			>
				<Box>
					<Heading fontSize="2xl">Conversation topics</Heading>
					<Text color="muted" fontSize="sm" mt="2">
						The interviewer uses these themes to guide a natural conversation.
					</Text>

					<Card.Root mt="5" variant="outline">
						<Card.Header>
							<Card.Title>Original topic notes</Card.Title>
							<Card.Description>
								The notes used to prepare this conversation plan.
							</Card.Description>
						</Card.Header>
						<Card.Body pt="0">
							<Text
								bg="bg.panel"
								color={detail.rawQuestions.trim() ? "fg" : "muted"}
								fontFamily="mono"
								fontSize="sm"
								lineHeight="1.7"
								minH="16"
								p="5"
								whiteSpace="pre-wrap"
							>
								{detail.rawQuestions.trim() ||
									"No original topic notes were saved for this interview."}
							</Text>
						</Card.Body>
					</Card.Root>

					<Stack gap="4" mt="5">
						{detail.questions.map((topic) => (
							<Card.Root key={topic.id} variant="outline">
								<Card.Body>
									<Flex align="flex-start" gap="4">
										<Flex
											align="center"
											bg="softAccent"
											color="cobalt"
											flexShrink="0"
											fontFamily="mono"
											fontSize="sm"
											h="11"
											justify="center"
											w="11"
										>
											{String(topic.position).padStart(2, "0")}
										</Flex>
										<Box minW="0">
											<Heading fontSize="lg">{topic.title}</Heading>
											{topic.objective && (
												<Text
													color="muted"
													fontSize="sm"
													lineHeight="1.6"
													mt="1.5"
												>
													{topic.objective}
												</Text>
											)}
										</Box>
									</Flex>

									<Grid
										borderColor="line"
										borderTopWidth="1px"
										gap="6"
										mt="5"
										pt="5"
										templateColumns={{
											base: "1fr",
											lg: topic.followUpGuidance ? "1fr 1fr" : "1fr",
										}}
									>
										<TopicDetail
											label="Conversation focus"
											value={topic.prompt}
										/>
										{topic.followUpGuidance && (
											<TopicDetail
												label="Follow-up direction"
												value={topic.followUpGuidance}
											/>
										)}
									</Grid>
								</Card.Body>
							</Card.Root>
						))}
					</Stack>
				</Box>

				<Stack gap="5">
					<Card.Root minW="0">
						<Card.Header>
							<Card.Title>Candidate access</Card.Title>
							<Card.Description>
								{detail.isPublic
									? "Anyone with this link can open the interview."
									: "Publish this interview before sharing it with candidates."}
							</Card.Description>
						</Card.Header>
						<Card.Body minW="0" pt="2">
							{detail.isPublic ? (
								<Clipboard.Root
									maxW="full"
									minW="0"
									onStatusChange={({ copied }) => {
										if (copied) {
											toaster.success({ title: "Candidate link copied" });
										}
									}}
									value={shareUrl}
									w="full"
								>
									<Clipboard.ValueText
										bg="canvas"
										borderColor="line"
										borderWidth="1px"
										display="block"
										fontFamily="mono"
										fontSize="xs"
										maxW="full"
										minW="0"
										overflow="hidden"
										p="3"
										textOverflow="ellipsis"
										whiteSpace="nowrap"
										w="full"
									/>
									<Flex gap="2" minW="0" mt="3">
										<Clipboard.Trigger asChild>
											<Button flex="1" variant="outline">
												<Copy aria-hidden="true" size={16} />
												Copy link
											</Button>
										</Clipboard.Trigger>
										<Button asChild flex="1">
											<a href={shareUrl} rel="noreferrer" target="_blank">
												Preview
												<ExternalLink aria-hidden="true" size={16} />
											</a>
										</Button>
									</Flex>
									<Button
										loading={updateInterview.isPending}
										mt="3"
										onClick={() => void setPublished(false)}
										variant="ghost"
										w="full"
									>
										<LockKeyhole aria-hidden="true" size={16} />
										Unpublish
									</Button>
								</Clipboard.Root>
							) : (
								<Button
									colorPalette="highlight"
									loading={updateInterview.isPending}
									onClick={() => void setPublished(true)}
									size="lg"
									w="full"
								>
									<Globe2 aria-hidden="true" size={17} />
									Publish interview
								</Button>
							)}
						</Card.Body>
					</Card.Root>

					<Card.Root>
						<Card.Header>
							<Card.Title>Manage interview</Card.Title>
							<Card.Description>
								Review candidate progress or remove this interview.
							</Card.Description>
						</Card.Header>
						<Card.Body pt="0">
							<Stack gap="2">
								<Button asChild variant="outline" w="full">
									<Link
										params={{ interviewId: detail.id }}
										to="/interviews/owned/$interviewId/participants"
									>
										<UsersRound aria-hidden="true" size={16} />
										Participant attempts
									</Link>
								</Button>

								<Dialog.Root role="alertdialog" size="sm">
									<Dialog.Trigger asChild>
										<Button colorPalette="red" variant="ghost" w="full">
											<Trash2 aria-hidden="true" size={16} />
											Delete interview
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
														“{detail.title}” will be permanently deleted.
														Interviews with attempts remain protected.
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
							</Stack>
						</Card.Body>
					</Card.Root>
				</Stack>
			</Grid>
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

function TopicDetail({ label, value }: { label: string; value: string }) {
	return (
		<Box>
			<Text
				color="muted"
				fontFamily="mono"
				fontSize="2xs"
				fontWeight="700"
				letterSpacing="0.08em"
				textTransform="uppercase"
			>
				{label}
			</Text>
			<Text fontSize="sm" lineHeight="1.7" mt="2">
				{value}
			</Text>
		</Box>
	);
}
