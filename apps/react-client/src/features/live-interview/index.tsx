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
import {
	Activity,
	AlertTriangle,
	ArrowLeft,
	Camera,
	CheckCircle2,
	LoaderCircle,
	Mic,
	MonitorUp,
	Radio,
	RefreshCw,
	ShieldCheck,
	Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Brand } from "@/components/atoms/brand";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { MediaPreview } from "@/components/molecules/media-preview";
import type { AttemptSnapshotResponseDtoState } from "@/shared/api/generated/application/models";
import { sharedInterviewQueryOptions } from "@/shared/api/modules/interviews/queries";
import { useInterviewFullscreen } from "@/shared/browser/interview-fullscreen";
import { parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";
import { interviewAudioPlayer, useInterviewMediaSession } from "@/shared/media";
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
	const preview = useQuery(sharedInterviewQueryOptions(shareCode));
	const fullscreen = useInterviewFullscreen();
	const [roomEnabled, setRoomEnabled] = useState(
		() => Boolean(document.fullscreenElement) && interviewAudioPlayer.isRunning,
	);
	const room = useInterviewRoom(attemptId, { enabled: roomEnabled });
	const media = useInterviewMediaSession();
	const [remaining, setRemaining] = useState<number | null>(() =>
		getRemainingSeconds(room.attempt.data?.deadlineAt ?? null),
	);

	useEffect(() => {
		const update = () =>
			setRemaining(getRemainingSeconds(room.attempt.data?.deadlineAt ?? null));
		update();
		const interval = window.setInterval(update, 1_000);
		return () => window.clearInterval(interval);
	}, [room.attempt.data?.deadlineAt]);

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
				<LoadingState label="Restoring interview room" />
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
							"This interview room could not be restored.",
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
					<Box bg="rgba(244,242,236,0.25)" h="6" w="1px" />
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
						<ShieldCheck aria-hidden="true" color="#D6FF4B" size={15} />
						<Text
							color="rgba(244,242,236,0.72)"
							fontFamily="mono"
							fontSize="xs"
						>
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
				<Flex
					align="center"
					bg={room.lastError.code === "AUDIO_UNAVAILABLE" ? "cobalt" : "danger"}
					color="white"
					gap="3"
					justify="space-between"
					px="6"
					py="3"
					role="alert"
				>
					<Flex align="center" gap="3">
						<AlertTriangle aria-hidden="true" size={17} />
						<Text fontSize="sm">{room.lastError.message}</Text>
					</Flex>
					<Flex gap="2">
						{canRetryAssistant && (
							<Button
								color="white"
								onClick={() => void retryAssistant()}
								size="sm"
								variant="outline"
							>
								<RefreshCw aria-hidden="true" size={14} /> Retry
							</Button>
						)}
						<Button
							color="white"
							onClick={room.clearError}
							size="sm"
							variant="ghost"
						>
							Dismiss
						</Button>
					</Flex>
				</Flex>
			)}

			<Grid flex="1" minH="0" templateColumns="minmax(0, 1fr) 340px">
				<Flex direction="column" minH="0">
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
									<Volume2
										aria-hidden="true"
										className="status-pulse"
										size={18}
									/>
								) : snapshot.state === "LISTENING" ? (
									<Mic aria-hidden="true" className="status-pulse" size={18} />
								) : terminal ? (
									<CheckCircle2 aria-hidden="true" size={18} />
								) : (
									<LoaderCircle
										aria-hidden="true"
										className="status-pulse"
										size={18}
									/>
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
								fontFamily="display"
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
								<Text
									bg="surface"
									borderColor="line"
									borderWidth="1px"
									color="muted"
									fontSize="sm"
									mt="7"
									p="4"
								>
									You said: {room.candidateSubtitle}
								</Text>
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
					>
						<Flex align="center" justify="space-between">
							<Text fontFamily="display" fontWeight="700">
								Conversation
							</Text>
							<Text color="muted" fontFamily="mono" fontSize="2xs">
								TEXT PERSISTS FOR RECONNECT
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
					<Text fontFamily="display" fontWeight="700">
						Device monitor
					</Text>
					<Grid gap="1" mt="4" templateRows="180px 150px">
						<MediaPreview label="Camera" stream={media.cameraStream} />
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
					{(!media.cameraActive ||
						!media.microphoneActive ||
						!media.screenActive) &&
						!terminal && (
							<Box
								bg="#FFF2D8"
								borderColor="#E6C070"
								borderWidth="1px"
								mt="5"
								p="4"
							>
								<Text fontSize="sm" fontWeight="700">
									A device stopped
								</Text>
								<Text color="muted" fontSize="sm" mt="2">
									Return to the lobby to reconnect it, then resume this attempt.
								</Text>
								<Button asChild mt="3" size="sm" variant="outline">
									<Link params={{ shareCode }} to="/interviews/$shareCode">
										Reconnect devices
									</Link>
								</Button>
							</Box>
						)}
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
				<Flex align="center" gap="3">
					<Box
						bg={
							microphoneRecording ? "danger" : terminal ? "success" : "cobalt"
						}
						className={microphoneRecording ? "status-pulse" : undefined}
						h="2.5"
						w="2.5"
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
				</Flex>
				<Flex align="center" gap="3">
					{microphoneRecording && (
						<Button
							bg="forest"
							color="paper"
							onClick={() => void room.finishAnswer()}
						>
							<Mic aria-hidden="true" size={16} />
							Finish answer
						</Button>
					)}
					{terminal && (
						<Button asChild bg="forest" color="paper">
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

function HeaderStatus({ active, label }: { active: boolean; label: string }) {
	return (
		<Flex align="center" gap="2">
			<Radio
				aria-hidden="true"
				className={active ? undefined : "status-pulse"}
				color={active ? "#D6FF4B" : "#F3A43B"}
				size={14}
			/>
			<Text color="rgba(244,242,236,0.72)" fontFamily="mono" fontSize="xs">
				{label}
			</Text>
		</Flex>
	);
}

function LatencyStatus({ latencyMs }: { latencyMs: number | null }) {
	const quality = getLatencyQuality(latencyMs);
	const color =
		quality === "excellent"
			? "#D6FF4B"
			: quality === "stable"
				? "#A9D8C1"
				: quality === "high"
					? "#F3A43B"
					: "rgba(244,242,236,0.48)";

	return (
		<Flex
			align="center"
			gap="2"
			title="Authenticated realtime round-trip latency"
		>
			<Activity aria-hidden="true" color={color} size={14} />
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
				<Icon
					aria-hidden="true"
					color={active ? "#247552" : "#68736D"}
					size={16}
				/>
				<Text fontSize="sm">{label}</Text>
			</Flex>
			<Text
				color={active ? "success" : "danger"}
				fontFamily="mono"
				fontSize="2xs"
			>
				{active ? "ACTIVE" : "STOPPED"}
			</Text>
		</Flex>
	);
}
