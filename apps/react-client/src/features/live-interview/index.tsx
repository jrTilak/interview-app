import {
	Alert,
	Blockquote,
	Box,
	Button,
	Link as ChakraLink,
	Flex,
	Grid,
	Heading,
	Icon,
	Spinner,
	Stack,
	Status,
	Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Activity,
	AlertTriangle,
	ArrowLeft,
	Camera,
	CheckCircle2,
	Mic,
	MonitorUp,
	RefreshCw,
	ShieldCheck,
	UserRoundX,
	Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/atoms/brand";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { MediaPreview } from "@/components/molecules/media-preview";
import type { AttemptSnapshotResponseDtoState } from "@/shared/api/generated/application/models";
import { DEFAULT_DEV_FLAGS } from "@/shared/api/modules/dev-flags/lib";
import { devFlagsQueryOptions } from "@/shared/api/modules/dev-flags/queries";
import { sharedInterviewQueryOptions } from "@/shared/api/modules/interviews/queries";
import {
	consumeInterviewAttemptHandoff,
	hasInterviewAttemptHandoff,
} from "@/shared/browser/interview-attempt-admission";
import {
	exitInterviewFullscreen,
	useInterviewFullscreen,
} from "@/shared/browser/interview-fullscreen";
import { parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";
import {
	interviewAudioPlayer,
	useFaceDetection,
	useInterviewMediaSession,
} from "@/shared/media";
import { formatCountdown, getRemainingSeconds } from "./deadline";
import { FullscreenInterruption } from "./fullscreen-interruption";
import { formatLatency, getLatencyQuality } from "./latency";
import { useInterviewRoom } from "./use-interview-room";

const stateCopy: Record<
	AttemptSnapshotResponseDtoState,
	{ description: string; label: string }
> = {
	ASSISTANT_SPEAKING: {
		description:
			"Listen to the interviewer. Your microphone opens after playback.",
		label: "Interviewer speaking",
	},
	COMPLETED: {
		description: "The interview has ended and your transcript is saved.",
		label: "Interview complete",
	},
	ENDING: {
		description: "The interviewer is closing the conversation.",
		label: "Finishing interview",
	},
	FAILED: {
		description: "The interview could not continue.",
		label: "Interview failed",
	},
	LISTENING: {
		description: "Answer naturally. A short silence submits your response.",
		label: "Your turn",
	},
	PROCESSING: {
		description: "Your answer is being transcribed and considered.",
		label: "Processing answer",
	},
	READY: {
		description: "The secure room is preparing the interviewer.",
		label: "Preparing room",
	},
};

/** Renders the full-viewport realtime interview control room. */
export function LiveInterviewScreen({
	attemptId,
	shareCode,
}: {
	attemptId: string;
	shareCode: string;
}) {
	const [admitted] = useState(() => hasInterviewAttemptHandoff(attemptId));

	useEffect(() => {
		if (admitted) consumeInterviewAttemptHandoff(attemptId);
	}, [admitted, attemptId]);

	if (!admitted) return <ClosedInterviewScreen />;

	return (
		<ActiveLiveInterviewScreen attemptId={attemptId} shareCode={shareCode} />
	);
}

function ActiveLiveInterviewScreen({
	attemptId,
	shareCode,
}: {
	attemptId: string;
	shareCode: string;
}) {
	const preview = useQuery(sharedInterviewQueryOptions(shareCode));
	const flagsQuery = useQuery(devFlagsQueryOptions());
	const flags = flagsQuery.data ?? DEFAULT_DEV_FLAGS;
	const fullscreen = useInterviewFullscreen();
	const [roomEnabled, setRoomEnabled] = useState(
		() => Boolean(document.fullscreenElement) && interviewAudioPlayer.isRunning,
	);
	const media = useInterviewMediaSession();
	const faceDetection = useFaceDetection(
		media.cameraStream,
		flags.faceDetectionEnabled,
	);
	const faceMissing =
		!media.cameraActive ||
		faceDetection.status === "initializing" ||
		faceDetection.status === "no-face" ||
		faceDetection.status === "error";
	const integrityPaused =
		flags.faceDetectionEnabled &&
		((faceMissing && flags.pauseOnNoFace) ||
			(faceDetection.status === "multiple" && flags.pauseOnMultipleFaces));
	const room = useInterviewRoom(attemptId, {
		detectedFaceCount: flags.faceDetectionEnabled
			? (faceDetection.count ?? (!media.cameraActive ? 0 : null))
			: null,
		enabled: roomEnabled,
		paused: integrityPaused,
		streamCameraToServer: flags.streamCameraToServer,
		streamScreenToServer: flags.streamScreenToServer,
	});
	const [remaining, setRemaining] = useState<number | null>(() =>
		getRemainingSeconds(room.attempt.data?.deadlineAt ?? null),
	);
	const conversationRef = useRef<HTMLDivElement>(null);
	const latestTurn = room.attempt.data?.turns.at(-1);
	const latestTurnKey = latestTurn
		? `${latestTurn.id}:${latestTurn.text}`
		: null;

	useEffect(() => {
		const update = () =>
			setRemaining(getRemainingSeconds(room.attempt.data?.deadlineAt ?? null));
		update();
		const interval = window.setInterval(update, 1_000);
		return () => window.clearInterval(interval);
	}, [room.attempt.data?.deadlineAt]);

	useEffect(() => {
		if (!latestTurnKey) return;
		const frame = window.requestAnimationFrame(() => {
			const conversation = conversationRef.current;
			conversation?.scrollTo({
				behavior: "smooth",
				top: conversation.scrollHeight,
			});
		});
		return () => window.cancelAnimationFrame(frame);
	}, [latestTurnKey]);

	useEffect(() => {
		if (room.connection.status === "disconnected") {
			void exitInterviewFullscreen().catch(() => undefined);
		}
	}, [room.connection.status]);

	const restoreFocusedRoom = async () => {
		try {
			const audioUnlock = room.unlockAudio();
			const fullscreenEntry = fullscreen.active
				? Promise.resolve()
				: fullscreen.enter();
			await Promise.all([audioUnlock, fullscreenEntry]);
			setRoomEnabled(true);
		} catch (error) {
			toaster.error({
				description: parseError(
					error,
					"Fullscreen and interview audio could not be enabled.",
				),
				title: "Focused view unavailable",
			});
		}
	};

	const audioOnlyBlock =
		fullscreen.active && (!roomEnabled || room.audioUnlockRequired);
	if (room.connection.status === "disconnected") {
		return <ClosedInterviewScreen disconnected />;
	}
	if (!fullscreen.active || !roomEnabled || room.audioUnlockRequired) {
		return (
			<FullscreenInterruption
				audioOnly={audioOnlyBlock}
				error={fullscreen.error}
				onEnter={() => void restoreFocusedRoom()}
				pending={fullscreen.pending}
				supported={fullscreen.supported}
				violations={fullscreen.violations}
			/>
		);
	}

	if (room.attempt.isPending || preview.isPending) {
		return (
			<Box p="10">
				<LoadingState label="Starting interview room" />
			</Box>
		);
	}

	if (
		room.attempt.isError ||
		preview.isError ||
		!room.attempt.data ||
		!preview.data
	) {
		const error = room.attempt.error ?? preview.error;
		return (
			<Box bg="paper" minH="100dvh" p="10">
				<Brand />
				<Box mt="16">
					<ErrorState
						description={parseError(
							error,
							"This interview room could not be opened.",
						)}
						onRetry={() => {
							void room.attempt.refetch();
							void preview.refetch();
						}}
						title="Room unavailable"
					/>
				</Box>
			</Box>
		);
	}

	const snapshot = room.attempt.data;
	const state = stateCopy[snapshot.state];
	const terminal =
		snapshot.state === "COMPLETED" || snapshot.state === "FAILED";
	const microphoneRecording = room.capture.status.microphone === "active";
	const canRetryAssistant =
		room.lastError?.retryable === true &&
		room.lastError.code === "PROVIDER_UNAVAILABLE" &&
		!terminal;

	const retryAssistant = async () => {
		try {
			await room.retryAssistant();
		} catch (error) {
			toaster.error({
				description: parseError(error, "The interviewer could not be retried."),
				title: "Retry failed",
			});
		}
	};

	return (
		<Flex bg="paper" direction="column" h="100dvh" overflow="hidden">
			<Flex
				align="center"
				bg="forest"
				color="paper"
				gap="7"
				h="16"
				justify="space-between"
				px="6"
			>
				<Flex align="center" gap="6" minW="0">
					<Brand inverted />
					<Box bg="paper/25" h="6" w="1px" />
					<Text fontSize="sm" fontWeight="600" truncate>
						{preview.data.title}
					</Text>
				</Flex>
				<Flex align="center" gap="6">
					<HeaderStatus
						active={room.connection.status === "connected"}
						label={room.connection.status}
					/>
					<LatencyStatus latencyMs={room.latencyMs} />
					<Flex align="center" gap="2">
						<Icon color="accent" size="sm">
							<ShieldCheck aria-hidden="true" />
						</Icon>
						<Text color="paper/72" fontFamily="mono" fontSize="xs">
							Media transient
						</Text>
					</Flex>
					<Text
						color={remaining !== null && remaining < 60 ? "accent" : "paper"}
						fontFamily="mono"
						fontSize="lg"
						fontWeight="700"
					>
						{formatCountdown(remaining)}
					</Text>
				</Flex>
			</Flex>

			{room.lastError && (
				<Alert.Root
					role="alert"
					status={
						room.lastError.code === "AUDIO_UNAVAILABLE" ? "info" : "error"
					}
					variant="solid"
				>
					<Alert.Indicator>
						<AlertTriangle aria-hidden="true" />
					</Alert.Indicator>
					<Alert.Content>
						<Alert.Description>{room.lastError.message}</Alert.Description>
					</Alert.Content>
					<Flex gap="2">
						{canRetryAssistant && (
							<Button
								colorPalette="inverse"
								onClick={() => void retryAssistant()}
								size="sm"
								variant="outline"
							>
								<RefreshCw aria-hidden="true" size={14} /> Retry
							</Button>
						)}
						<Button
							colorPalette="inverse"
							onClick={room.clearError}
							size="sm"
							variant="ghost"
						>
							Dismiss
						</Button>
					</Flex>
				</Alert.Root>
			)}

			<Grid flex="1" minH="0" templateColumns="minmax(0, 1fr) 340px">
				<Flex direction="column" minH="0" position="relative">
					{integrityPaused && (
						<Flex
							align="center"
							bg="paper"
							direction="column"
							inset="0"
							justify="center"
							p="10"
							position="absolute"
							textAlign="center"
							zIndex="2"
						>
							<Flex
								align="center"
								bg="softDanger"
								color="danger"
								h="14"
								justify="center"
								w="14"
							>
								<UserRoundX aria-hidden="true" size={24} />
							</Flex>
							<Heading fontSize="3xl" mt="5">
								Interview paused
							</Heading>
							<Text color="muted" mt="2">
								{faceDetection.status === "multiple"
									? "Only one person may be visible."
									: "Return to the camera frame."}
							</Text>
						</Flex>
					)}
					<Flex
						align="center"
						borderBottomColor="line"
						borderBottomWidth="1px"
						flex="1"
						justify="center"
						minH="0"
						p="10"
						position="relative"
					>
						<Box maxW="4xl" textAlign="center">
							<Flex align="center" color="cobalt" gap="2" justify="center">
								{snapshot.state === "ASSISTANT_SPEAKING" ? (
									<Icon animationStyle="status-pulse" size="sm">
										<Volume2 aria-hidden="true" />
									</Icon>
								) : snapshot.state === "LISTENING" ? (
									<Icon animationStyle="status-pulse" size="sm">
										<Mic aria-hidden="true" />
									</Icon>
								) : terminal ? (
									<CheckCircle2 aria-hidden="true" size={18} />
								) : (
									<Spinner aria-label="Processing" size="sm" />
								)}
								<Text
									fontFamily="mono"
									fontSize="xs"
									fontWeight="700"
									letterSpacing="0.1em"
								>
									{state.label.toUpperCase()}
								</Text>
							</Flex>
							<Heading
								aria-live="polite"
								fontSize="4xl"
								fontWeight="600"
								letterSpacing="-0.035em"
								lineHeight="1.2"
								mt="6"
							>
								{room.assistantSubtitle ||
									(terminal
										? "Thank you. This interview is complete."
										: "The interviewer is preparing the next turn.")}
							</Heading>
							<Text color="muted" mt="5">
								{state.description}
							</Text>
							{room.candidateSubtitle && snapshot.state === "PROCESSING" && (
								<Blockquote.Root colorPalette="brand" mt="7">
									<Blockquote.Content>
										{room.candidateSubtitle}
									</Blockquote.Content>
									<Blockquote.Caption>You said</Blockquote.Caption>
								</Blockquote.Root>
							)}
						</Box>
					</Flex>

					<Box
						bg="surface"
						maxH="32%"
						minH="180px"
						overflowY="auto"
						px="8"
						py="6"
						ref={conversationRef}
					>
						<Flex align="center" justify="space-between">
							<Heading fontSize="md">Conversation</Heading>
							<Text color="muted" fontFamily="mono" fontSize="2xs">
								LATEST MESSAGE SHOWN AUTOMATICALLY
							</Text>
						</Flex>
						<Stack gap="4" mt="5">
							{snapshot.turns.length === 0 && (
								<Text color="muted" fontSize="sm">
									The conversation will appear here after the first turn.
								</Text>
							)}
							{snapshot.turns.map((turn) => (
								<Grid
									gap="4"
									key={turn.id}
									templateColumns="90px minmax(0, 1fr)"
								>
									<Text
										color={turn.role === "assistant" ? "cobalt" : "success"}
										fontFamily="mono"
										fontSize="2xs"
										fontWeight="700"
										pt="1"
									>
										{turn.role === "assistant" ? "INTERVIEWER" : "YOU"}
									</Text>
									<Text fontSize="sm" lineHeight="1.6">
										{turn.text}
									</Text>
								</Grid>
							))}
						</Stack>
					</Box>
				</Flex>

				<Flex
					borderLeftColor="line"
					borderLeftWidth="1px"
					direction="column"
					minH="0"
					overflowY="auto"
					p="5"
				>
					<Heading fontSize="md">Device monitor</Heading>
					<Grid gap="1" mt="4" templateRows="180px 150px">
						<MediaPreview
							faceDetection={faceDetection}
							label="Camera"
							stream={media.cameraStream}
						/>
						<MediaPreview label="Screen" stream={media.screenStream} />
					</Grid>
					<Stack gap="0" mt="5">
						<DeviceStatus
							active={media.cameraActive}
							icon={Camera}
							label="Camera"
						/>
						<DeviceStatus
							active={media.microphoneActive}
							icon={Mic}
							label="Microphone"
						/>
						<DeviceStatus
							active={media.screenActive}
							icon={MonitorUp}
							label="Screen"
						/>
					</Stack>
				</Flex>
			</Grid>

			<Flex
				align="center"
				borderTopColor="line"
				borderTopWidth="1px"
				gap="5"
				h="20"
				justify="space-between"
				px="6"
			>
				<Status.Root
					colorPalette={
						microphoneRecording ? "red" : terminal ? "green" : "brand"
					}
				>
					<Status.Indicator
						animationStyle={microphoneRecording ? "status-pulse" : undefined}
					/>
					<Box>
						<Text fontSize="sm" fontWeight="700">
							{state.label}
						</Text>
						<Text color="muted" fontSize="xs">
							{microphoneRecording
								? "Recording PCM audio · silence auto-submits"
								: state.description}
						</Text>
					</Box>
				</Status.Root>
				<Flex align="center" gap="3">
					{microphoneRecording && (
						<Button onClick={() => void room.finishAnswer()}>
							<Mic aria-hidden="true" size={16} />
							Finish answer
						</Button>
					)}
					{terminal && (
						<Button asChild>
							<Link to="/dashboard">Return to dashboard</Link>
						</Button>
					)}
					{!terminal && (
						<ChakraLink asChild color="muted" fontSize="sm">
							<Link to="/dashboard">
								<ArrowLeft aria-hidden="true" size={14} /> Leave room
							</Link>
						</ChakraLink>
					)}
				</Flex>
			</Flex>
		</Flex>
	);
}

function ClosedInterviewScreen({
	disconnected = false,
}: {
	disconnected?: boolean;
}) {
	return (
		<Flex
			align="center"
			bg="paper"
			direction="column"
			justify="center"
			minH="100dvh"
			p="10"
			textAlign="center"
		>
			<Heading fontSize="3xl">
				{disconnected
					? "Interview disconnected"
					: "Interview cannot be resumed"}
			</Heading>
			<Text color="muted" lineHeight="1.7" maxW="xl" mt="3">
				{disconnected
					? "The connection or a required device stopped. This attempt cannot be reopened."
					: "This attempt was already opened. Reloading or returning to its room is not allowed."}
			</Text>
			<Button asChild mt="6">
				<Link to="/dashboard">Return to dashboard</Link>
			</Button>
		</Flex>
	);
}

function HeaderStatus({ active, label }: { active: boolean; label: string }) {
	return (
		<Status.Root
			color="paper/72"
			colorPalette={active ? "highlight" : "orange"}
			fontFamily="mono"
		>
			<Status.Indicator animationStyle={active ? undefined : "status-pulse"} />
			{label}
		</Status.Root>
	);
}

function LatencyStatus({ latencyMs }: { latencyMs: number | null }) {
	const quality = getLatencyQuality(latencyMs);
	const color =
		quality === "excellent"
			? "accent"
			: quality === "stable"
				? "successSoft"
				: quality === "high"
					? "warning"
					: "paper/48";

	return (
		<Flex
			align="center"
			gap="2"
			title="Authenticated realtime round-trip latency"
		>
			<Icon color={color} size="sm">
				<Activity aria-hidden="true" />
			</Icon>
			<Text color={color} fontFamily="mono" fontSize="xs">
				PING {formatLatency(latencyMs)}
			</Text>
		</Flex>
	);
}

function DeviceStatus({
	active,
	icon: Icon,
	label,
}: {
	active: boolean;
	icon: typeof Camera;
	label: string;
}) {
	return (
		<Flex
			align="center"
			borderBottomColor="line"
			borderBottomWidth="1px"
			justify="space-between"
			py="3"
		>
			<Flex align="center" gap="3">
				<Box color={active ? "success" : "muted"}>
					<Icon aria-hidden="true" size={16} />
				</Box>
				<Text fontSize="sm">{label}</Text>
			</Flex>
			<Status.Root
				colorPalette={active ? "green" : "red"}
				fontFamily="mono"
				size="sm"
			>
				<Status.Indicator />
				{active ? "ACTIVE" : "STOPPED"}
			</Status.Root>
		</Flex>
	);
}
