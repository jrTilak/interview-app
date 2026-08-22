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
import { Link, useRouter } from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	Camera,
	Check,
	Clock3,
	ListChecks,
	type Mic,
	MonitorUp,
	Repeat2,
	ShieldCheck,
	UserRoundCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/atoms/brand";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { MediaPreview } from "@/components/molecules/media-preview";
import { useJoinInterview } from "@/shared/api/modules/attempts/hooks";
import { DEFAULT_DEV_FLAGS } from "@/shared/api/modules/dev-flags/lib";
import { devFlagsQueryOptions } from "@/shared/api/modules/dev-flags/queries";
import { sharedInterviewQueryOptions } from "@/shared/api/modules/interviews/queries";
import {
	exitInterviewFullscreen,
	requestInterviewFullscreen,
} from "@/shared/browser/interview-fullscreen";
import { formatDuration } from "@/shared/lib/format";
import { parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";
import {
	interviewAudioPlayer,
	interviewMediaSession,
	useFaceDetection,
	useInterviewMediaSession,
} from "@/shared/media";

/** Runs device preflight before creating or resuming a candidate attempt. */
export function JoinInterviewScreen({ shareCode }: { shareCode: string }) {
	const preview = useQuery(sharedInterviewQueryOptions(shareCode));
	const flagsQuery = useQuery(devFlagsQueryOptions());
	const flags = flagsQuery.data ?? DEFAULT_DEV_FLAGS;
	const join = useJoinInterview();
	const media = useInterviewMediaSession();
	const router = useRouter();
	const handingOff = useRef(false);
	const [acquiringCamera, setAcquiringCamera] = useState(false);
	const [acquiringScreen, setAcquiringScreen] = useState(false);
	const faceDetection = useFaceDetection(
		media.cameraStream,
		flags.faceDetectionEnabled,
	);
	const isLocalhost = ["localhost", "127.0.0.1"].includes(
		window.location.hostname,
	);
	const mediaDevices = navigator.mediaDevices as
		| Partial<MediaDevices>
		| undefined;
	const mediaSupported = Boolean(
		mediaDevices?.getUserMedia && mediaDevices.getDisplayMedia,
	);
	const secure = window.isSecureContext || isLocalhost;

	useEffect(
		() => () => {
			if (!handingOff.current) interviewMediaSession.stopAll();
		},
		[],
	);

	const requestCamera = async () => {
		setAcquiringCamera(true);
		try {
			await interviewMediaSession.acquireCameraAndMicrophone();
		} catch (error) {
			toaster.error({
				description: parseError(
					error,
					"Allow camera and microphone access to continue.",
				),
				title: "Device access failed",
			});
		} finally {
			setAcquiringCamera(false);
		}
	};

	const requestScreen = async () => {
		setAcquiringScreen(true);
		try {
			await interviewMediaSession.acquireScreen({
				requireMonitor: flags.requireWholeScreen,
			});
		} catch (error) {
			toaster.error({
				description: parseError(error, "Choose Entire Screen to continue."),
				title: "Screen share not selected",
			});
		} finally {
			setAcquiringScreen(false);
		}
	};

	const beginInterview = async () => {
		handingOff.current = false;
		try {
			// Both protected browser capabilities must start inside this click gesture.
			await Promise.all([
				interviewAudioPlayer.resume(),
				requestInterviewFullscreen(),
			]);
			const attempt = await join.mutateAsync(shareCode);
			handingOff.current = true;
			await router.navigate({
				params: { attemptId: attempt.id, shareCode },
				to: "/interviews/$shareCode/attempts/$attemptId",
			});
		} catch (error) {
			handingOff.current = false;
			await exitInterviewFullscreen().catch(() => undefined);
			toaster.error({
				description: parseError(
					error,
					"The interview room could not be opened.",
				),
				title: "Unable to join interview",
			});
		}
	};

	const faceReady =
		!flags.faceDetectionEnabled ||
		!flags.requireSingleFaceToStart ||
		faceDetection.status === "single";
	const ready =
		media.cameraActive &&
		media.microphoneActive &&
		media.screenActive &&
		faceReady;

	return (
		<Box bg="paper" minH="100dvh">
			<Flex
				align="center"
				borderBottomColor="line"
				borderBottomWidth="1px"
				h="18"
				justify="space-between"
				px="10"
			>
				<Brand />
				<Flex align="center" gap="2">
					<ShieldCheck aria-hidden="true" color="#247552" size={16} />
					<Text color="muted" fontFamily="mono" fontSize="xs">
						Authenticated candidate lobby
					</Text>
				</Flex>
			</Flex>

			<Box maxW="1440px" mx="auto" px="10" py="9">
				<ChakraLink
					asChild
					color="muted"
					display="inline-flex"
					fontSize="sm"
					onClick={() => interviewMediaSession.stopAll()}
				>
					<Link to="/dashboard">
						<ArrowLeft aria-hidden="true" size={15} />
						Leave lobby
					</Link>
				</ChakraLink>

				{preview.isPending && (
					<LoadingState label="Loading interview details" />
				)}
				{preview.isError && (
					<ErrorState
						description={parseError(
							preview.error,
							"This interview link is unavailable.",
						)}
						onRetry={() => void preview.refetch()}
						title="Interview unavailable"
					/>
				)}

				{preview.data && (
					<Grid gap="12" mt="7" templateColumns="minmax(0, 1fr) 430px">
						<Box>
							<Text
								color="cobalt"
								fontFamily="mono"
								fontSize="xs"
								fontWeight="700"
								letterSpacing="0.1em"
							>
								INTERVIEW BRIEF
							</Text>
							<Heading
								fontFamily="display"
								fontSize="5xl"
								letterSpacing="-0.04em"
								lineHeight="1"
								mt="3"
							>
								{preview.data.title}
							</Heading>
							<Text
								color="muted"
								fontSize="lg"
								lineHeight="1.65"
								mt="5"
								maxW="3xl"
							>
								{preview.data.description ||
									"The interviewer will guide you through a structured question set."}
							</Text>
							<Flex
								borderColor="line"
								borderYWidth="1px"
								gap="12"
								mt="8"
								py="5"
							>
								<BriefStat
									icon={Clock3}
									label="Hard limit"
									value={formatDuration(preview.data.durationMinutes)}
								/>
								<BriefStat
									icon={ListChecks}
									label="Question set"
									value={`${preview.data.questionCount} tasks`}
								/>
								<BriefStat
									icon={Repeat2}
									label="Attempt policy"
									value={
										preview.data.allowMultipleAttempts
											? "Repeat allowed"
											: "One attempt"
									}
								/>
							</Flex>

							<Box mt="10">
								<Heading fontFamily="display" fontSize="2xl">
									Before you begin
								</Heading>
								<Stack gap="0" mt="5">
									<DeviceRow
										active={media.cameraActive && media.microphoneActive}
										icon={Camera}
										label="Camera and microphone"
										onClick={() => void requestCamera()}
										pending={acquiringCamera}
									/>
									{flags.faceDetectionEnabled && (
										<DeviceRow
											active={faceDetection.status === "single"}
											icon={UserRoundCheck}
											label={
												faceDetection.status === "single"
													? "One face detected"
													: faceDetection.status === "multiple"
														? "Only one person is allowed"
														: faceDetection.status === "error"
															? "Face detector unavailable"
															: "Center your face"
											}
										/>
									)}
									<DeviceRow
										active={media.screenActive}
										icon={MonitorUp}
										label="Screen sharing"
										onClick={() => void requestScreen()}
										pending={acquiringScreen}
									/>
								</Stack>
							</Box>

							{(!secure || !mediaSupported) && (
								<Box bg="danger" color="white" mt="6" p="4" role="alert">
									This browser cannot provide secure desktop media capture. Use
									a recent desktop Chrome or Edge browser over HTTPS or
									localhost.
								</Box>
							)}

							<Button
								bg="forest"
								color="paper"
								disabled={
									!ready || !secure || !mediaSupported || join.isPending
								}
								h="13"
								loading={join.isPending}
								loadingText="Opening secure room…"
								mt="8"
								onClick={() => void beginInterview()}
								px="7"
							>
								Begin or resume interview
								<ArrowRight aria-hidden="true" size={17} />
							</Button>
							<Text
								color="muted"
								fontSize="xs"
								lineHeight="1.55"
								maxW="lg"
								mt="3"
							>
								The focused interview opens in browser fullscreen. If you press
								Escape, the room is concealed until you explicitly return.
							</Text>
						</Box>

						<Box>
							<Grid gap="1" templateRows="240px 190px">
								<MediaPreview
									faceDetection={faceDetection}
									label="Camera preview"
									stream={media.cameraStream}
								/>
								<MediaPreview
									label="Shared screen"
									stream={media.screenStream}
								/>
							</Grid>
							<Box
								bg="surface"
								borderColor="line"
								borderWidth="1px"
								mt="5"
								p="5"
							>
								<Flex align="center" gap="3">
									<ShieldCheck aria-hidden="true" color="#247552" size={19} />
									<Text fontWeight="700">Media handling in this phase</Text>
								</Flex>
								<Text color="muted" fontSize="sm" lineHeight="1.65" mt="3">
									Video stays in the browser unless its development streaming
									flag is on. Microphone audio is discarded after transcription.
								</Text>
							</Box>
						</Box>
					</Grid>
				)}
			</Box>
		</Box>
	);
}

function BriefStat({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Clock3;
	label: string;
	value: string;
}) {
	return (
		<Flex align="center" gap="3">
			<Icon aria-hidden="true" color="#2447F2" size={18} />
			<Box>
				<Text color="muted" fontFamily="mono" fontSize="2xs">
					{label.toUpperCase()}
				</Text>
				<Text fontWeight="700" mt="1">
					{value}
				</Text>
			</Box>
		</Flex>
	);
}

function DeviceRow({
	active,
	icon: Icon,
	label,
	onClick,
	pending = false,
}: {
	active: boolean;
	icon: typeof Camera | typeof Mic;
	label: string;
	onClick?: () => void;
	pending?: boolean;
}) {
	return (
		<Flex
			align="center"
			borderBottomColor="line"
			borderBottomWidth="1px"
			gap="4"
			justify="space-between"
			py="4"
		>
			<Flex align="center" gap="3">
				<Icon
					aria-hidden="true"
					color={active ? "#247552" : "#68736D"}
					size={18}
				/>
				<Text fontWeight="600">{label}</Text>
			</Flex>
			{active ? (
				<Flex align="center" color="success" fontSize="sm" gap="2">
					<Check aria-hidden="true" size={15} /> Ready
				</Flex>
			) : onClick ? (
				<Button loading={pending} onClick={onClick} size="sm" variant="outline">
					{pending ? "Waiting…" : "Connect"}
				</Button>
			) : (
				<Text color="danger" fontSize="sm">
					Needs attention
				</Text>
			)}
		</Flex>
	);
}
