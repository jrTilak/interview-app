import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { GetAttemptOutput } from "@/shared/api/modules/attempts/lib";
import { attemptQueryOptions } from "@/shared/api/modules/attempts/queries";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { APP_CONFIG, getRealtimeOrigin } from "@/shared/config/app.config";
import { parseError } from "@/shared/lib/parse-error";
import {
	interviewAudioPlayer,
	interviewMediaSession,
	PcmMicrophoneCaptureController,
	WebAudioMicrophoneFrameSource,
} from "@/shared/media";
import {
	DisposableMediaStreamer,
	pauseDisposableMediaStreamers,
	resumeDisposableMediaStreamers,
} from "@/shared/realtime/disposable-media-streamer";
import type {
	AcceptedPayload,
	AttemptMedia,
	AttemptSnapshot,
	ConnectionPingAckData,
	InterviewSocket,
	RealtimeErrorPayload,
} from "@/shared/realtime/protocol";
import {
	emitWithAck,
	RealtimeRequestError,
	toUint8Array,
} from "@/shared/realtime/socket-ack";
import { useInterviewRoomStore } from "@/stores/interview-room.store";
import { LatencyProbe } from "./latency-probe";

const MEDIA_ACCEPTING_STATES = new Set([
	"ASSISTANT_SPEAKING",
	"LISTENING",
	"PROCESSING",
]);
const LATENCY_PROBE_INTERVAL_MS = 10_000;
const LATENCY_PROBE_TIMEOUT_MS = 5_000;

export type UseInterviewRoomOptions = {
	detectedFaceCount?: number | null;
	enabled?: boolean;
	paused?: boolean;
	streamCameraToServer?: boolean;
	streamScreenToServer?: boolean;
};

/** Owns one single-use Socket.IO room and its transient browser media. */
export function useInterviewRoom(
	attemptId: string,
	{
		detectedFaceCount = null,
		enabled = true,
		paused = false,
		streamCameraToServer = false,
		streamScreenToServer = false,
	}: UseInterviewRoomOptions = {},
) {
	const attempt = useQuery(attemptQueryOptions(attemptId));
	const cache = useQueryClient();
	const [assistantSubtitle, setAssistantSubtitle] = useState("");
	const [audioUnlockRequired, setAudioUnlockRequired] = useState(
		() => !interviewAudioPlayer.isRunning,
	);
	const [candidateSubtitle, setCandidateSubtitle] = useState("");
	const [latencyMs, setLatencyMs] = useState<number | null>(null);
	const audioUnlockedRef = useRef(interviewAudioPlayer.isRunning);
	const afterAudioUnlockRef = useRef<() => Promise<void>>(
		async () => undefined,
	);
	const snapshotRef = useRef<AttemptSnapshot | undefined>(attempt.data);
	const finishAnswerRef = useRef<() => Promise<void>>(async () => undefined);
	const retryAssistantRef = useRef<() => Promise<void>>(async () => undefined);
	const integrityControlRef = useRef<(paused: boolean) => Promise<void>>(
		async () => undefined,
	);
	const integrityReportRef = useRef<(count: number | null) => Promise<void>>(
		async () => undefined,
	);
	const integrityRef = useRef({
		detectedFaceCount,
		paused,
		streamCameraToServer,
		streamScreenToServer,
	});
	const connection = useInterviewRoomStore((state) => state.connection);
	const capture = useInterviewRoomStore((state) => state.capture);
	const playback = useInterviewRoomStore((state) => state.playback);
	const lastError = useInterviewRoomStore((state) => state.lastError);

	useEffect(() => {
		snapshotRef.current = attempt.data;
	}, [attempt.data]);

	useEffect(() => {
		integrityRef.current = {
			detectedFaceCount,
			paused,
			streamCameraToServer,
			streamScreenToServer,
		};
		void integrityControlRef.current(paused);
		void integrityReportRef.current(detectedFaceCount);
	}, [detectedFaceCount, paused, streamCameraToServer, streamScreenToServer]);

	const unlockAudio = useCallback(async () => {
		await interviewAudioPlayer.resume();
		if (!interviewAudioPlayer.isRunning) {
			throw new Error("Browser audio could not be enabled.");
		}
		audioUnlockedRef.current = true;
		setAudioUnlockRequired(false);
		await afterAudioUnlockRef.current();
	}, []);

	const canConnect = enabled && Boolean(attempt.data);
	useEffect(() => {
		if (!canConnect) return;
		let disposed = false;
		let connectionVersion = 0;
		let activeMicrophoneTurnId: string | undefined;
		let microphone: PcmMicrophoneCaptureController | undefined;
		let microphoneStartVersion = 0;
		let microphoneStarting = false;
		let rejectMicrophoneStartGate: ((error: unknown) => void) | undefined;
		let playbackChain = Promise.resolve();
		let playbackGeneration = 0;
		let latencyIntervalId: number | undefined;
		let cameraStreamer: DisposableMediaStreamer | undefined;
		let screenStreamer: DisposableMediaStreamer | undefined;
		let sessionClosed = false;
		const store = useInterviewRoomStore.getState();
		const socket: InterviewSocket = io(
			`${getRealtimeOrigin()}${APP_CONFIG.roomNamespace}`,
			{
				autoConnect: false,
				reconnection: false,
				transports: ["websocket", "polling"],
				withCredentials: true,
			},
		);
		audioUnlockedRef.current = interviewAudioPlayer.isRunning;
		setAudioUnlockRequired(!interviewAudioPlayer.isRunning);
		const latencyProbe = new LatencyProbe();

		const stopLatencySampling = () => {
			if (latencyIntervalId !== undefined) {
				window.clearInterval(latencyIntervalId);
				latencyIntervalId = undefined;
			}
			latencyProbe.reset();
			setLatencyMs(null);
		};

		const probeLatency = async (connectedVersion: number) => {
			if (
				disposed ||
				connectedVersion !== connectionVersion ||
				!socket.connected
			) {
				return;
			}
			try {
				const probeId = crypto.randomUUID();
				const measured = await latencyProbe.measure(async () => {
					const acknowledgement = await emitWithAck<ConnectionPingAckData>(
						socket,
						"connection:ping",
						{ probeId },
						LATENCY_PROBE_TIMEOUT_MS,
					);
					if (acknowledgement.probeId !== probeId) {
						throw new Error("Latency acknowledgement did not match its probe.");
					}
				});
				if (
					measured !== null &&
					!disposed &&
					connectedVersion === connectionVersion &&
					socket.connected
				) {
					setLatencyMs(measured);
				}
			} catch {
				if (
					!disposed &&
					connectedVersion === connectionVersion &&
					socket.connected
				) {
					setLatencyMs(null);
				}
			}
		};

		const startLatencySampling = (connectedVersion: number) => {
			stopLatencySampling();
			void probeLatency(connectedVersion);
			latencyIntervalId = window.setInterval(
				() => void probeLatency(connectedVersion),
				LATENCY_PROBE_INTERVAL_MS,
			);
		};

		const reportError = (error: unknown, fallback: string) => {
			const payload: RealtimeErrorPayload =
				error instanceof RealtimeRequestError
					? {
							code: error.code,
							message: error.message,
							retryable: error.retryable,
						}
					: {
							code: "CLIENT_MEDIA_ERROR",
							message: parseError(error, fallback),
							retryable: true,
						};
			useInterviewRoomStore.getState().setLastError(payload);
		};

		const stopStreamers = () => {
			cameraStreamer?.stop();
			screenStreamer?.stop();
			cameraStreamer = undefined;
			screenStreamer = undefined;
		};

		const discardActiveMicrophone = () => {
			const controller = microphone;
			const turnId = activeMicrophoneTurnId;
			microphone = undefined;
			activeMicrophoneTurnId = undefined;
			microphoneStarting = false;
			microphoneStartVersion += 1;
			const rejectStart = rejectMicrophoneStartGate;
			rejectMicrophoneStartGate = undefined;
			rejectStart?.(
				new Error("The disconnected microphone turn was discarded."),
			);
			const room = useInterviewRoomStore.getState();
			if (turnId) room.finishMicrophoneTurn(turnId);
			room.setCaptureStatus("microphone", "idle");
			void controller?.cancel();
		};

		const cancelActiveMicrophone = async () => {
			const turnId = activeMicrophoneTurnId;
			if (turnId && socket.connected) {
				await emitWithAck<AcceptedPayload>(socket, "microphone:cancel", {
					attemptId,
					turnId,
				}).catch(() => undefined);
			}
			discardActiveMicrophone();
		};

		const stopPlayback = () => {
			playbackGeneration += 1;
			playbackChain = Promise.resolve();
			const room = useInterviewRoomStore.getState();
			const turnId = room.playback.turnId;
			interviewAudioPlayer.stop();
			if (!integrityRef.current.paused) {
				resumeDisposableMediaStreamers(cameraStreamer, screenStreamer);
			}
			if (turnId) room.finishPlayback(turnId);
		};

		const stopTerminalMedia = () => {
			const room = useInterviewRoomStore.getState();
			// Clear the joined marker before stopAll synchronously notifies subscribers.
			room.setJoinedAttemptId(null);
			discardActiveMicrophone();
			stopStreamers();
			stopPlayback();
			interviewMediaSession.stopAll();
			room.setCaptureStatus("camera", "idle");
			room.setCaptureStatus("screen", "idle");
		};

		const closeDisconnectedSession = () => {
			if (disposed || sessionClosed) return;
			sessionClosed = true;
			stopLatencySampling();
			const room = useInterviewRoomStore.getState();
			room.setJoinedAttemptId(null);
			discardActiveMicrophone();
			stopStreamers();
			stopPlayback();
			interviewMediaSession.stopAll();
			room.setCaptureStatus("camera", "idle");
			room.setCaptureStatus("screen", "idle");
			room.setConnectionStatus("disconnected");
		};

		const updateSnapshot = (snapshot: AttemptSnapshot) => {
			if (snapshot.id !== attemptId) return;
			snapshotRef.current = snapshot;
			cache.setQueryData<GetAttemptOutput>(
				QUERY_KEYS.attempts.detail(attemptId),
				(current) => ({
					data: snapshot,
					message: current?.message ?? "Updated successfully",
				}),
			);
			if (snapshot.state === "COMPLETED" || snapshot.state === "FAILED") {
				stopTerminalMedia();
			}
		};

		const canSendDisposableMedia = () => {
			const snapshot = snapshotRef.current;
			return Boolean(
				socket.connected &&
					!integrityRef.current.paused &&
					snapshot &&
					MEDIA_ACCEPTING_STATES.has(snapshot.state),
			);
		};

		const reconcileStreamers = () => {
			const media = interviewMediaSession.getSnapshot();
			if (
				integrityRef.current.streamCameraToServer &&
				media.cameraActive &&
				media.cameraStream &&
				!cameraStreamer
			) {
				cameraStreamer = new DisposableMediaStreamer({
					attemptId,
					canSend: canSendDisposableMedia,
					kind: "camera",
					onError: (error) =>
						reportError(error, "Camera transport was interrupted."),
					socket,
					stream: media.cameraStream,
				});
				try {
					cameraStreamer.start();
					useInterviewRoomStore.getState().setCaptureStatus("camera", "active");
				} catch (error) {
					reportError(error, "Camera transport could not start.");
				}
			} else if (
				!integrityRef.current.streamCameraToServer ||
				!media.cameraActive
			) {
				cameraStreamer?.stop();
				cameraStreamer = undefined;
				useInterviewRoomStore.getState().setCaptureStatus("camera", "idle");
			}

			if (
				integrityRef.current.streamScreenToServer &&
				media.screenActive &&
				media.screenStream &&
				!screenStreamer
			) {
				screenStreamer = new DisposableMediaStreamer({
					attemptId,
					canSend: canSendDisposableMedia,
					kind: "screen",
					onError: (error) =>
						reportError(error, "Screen transport was interrupted."),
					socket,
					stream: media.screenStream,
				});
				try {
					screenStreamer.start();
					useInterviewRoomStore.getState().setCaptureStatus("screen", "active");
				} catch (error) {
					reportError(error, "Screen transport could not start.");
				}
			} else if (
				!integrityRef.current.streamScreenToServer ||
				!media.screenActive
			) {
				screenStreamer?.stop();
				screenStreamer = undefined;
				useInterviewRoomStore.getState().setCaptureStatus("screen", "idle");
			}
		};

		const syncMediaStatus = async () => {
			if (
				!socket.connected ||
				!useInterviewRoomStore.getState().connection.joinedAttemptId
			) {
				return;
			}
			const media = interviewMediaSession.getSnapshot();
			const snapshot = snapshotRef.current;
			if (
				snapshot &&
				snapshot.state !== "COMPLETED" &&
				snapshot.state !== "FAILED" &&
				(!media.cameraActive || !media.microphoneActive || !media.screenActive)
			) {
				closeDisconnectedSession();
				socket.disconnect();
				return;
			}
			try {
				await emitWithAck<AttemptMedia>(socket, "media:status", {
					attemptId,
					cameraActive: media.cameraActive,
					microphoneActive: media.microphoneActive,
					screenActive: media.screenActive,
				});
				reconcileStreamers();
			} catch (error) {
				reportError(error, "Device status could not be synchronized.");
			}
		};

		const maybeStartMicrophone = async () => {
			const snapshot = snapshotRef.current;
			const room = useInterviewRoomStore.getState();
			const media = interviewMediaSession.getSnapshot();
			if (
				disposed ||
				integrityRef.current.paused ||
				microphone ||
				microphoneStarting ||
				!socket.connected ||
				room.connection.joinedAttemptId !== attemptId ||
				snapshot?.state !== "LISTENING" ||
				room.playback.status !== "idle" ||
				!audioUnlockedRef.current ||
				!media.microphoneActive ||
				!media.cameraStream
			) {
				return;
			}

			microphoneStarting = true;
			room.setCaptureStatus("microphone", "starting");
			const startVersion = ++microphoneStartVersion;
			const turnId = crypto.randomUUID();
			activeMicrophoneTurnId = turnId;
			let serverTurnAccepted = false;
			let resolveStartGate: () => void = () => undefined;
			let rejectStartGate: (error: unknown) => void = () => undefined;
			const startGate = new Promise<void>((resolve, reject) => {
				resolveStartGate = resolve;
				rejectStartGate = reject;
			});
			rejectMicrophoneStartGate = rejectStartGate;
			void startGate.catch(() => undefined);
			const source = new WebAudioMicrophoneFrameSource(
				{},
				{ mediaStream: media.cameraStream },
			);
			let controller: PcmMicrophoneCaptureController;
			const isCurrentTurn = () =>
				microphone === controller && microphoneStartVersion === startVersion;
			controller = new PcmMicrophoneCaptureController(
				source,
				{
					async onChunk(chunk) {
						await startGate;
						if (!isCurrentTurn() || disposed || !socket.connected) {
							throw new Error("The microphone turn is no longer connected.");
						}
						await emitWithAck<AcceptedPayload>(socket, "microphone:chunk", {
							attemptId,
							data: chunk.data,
							sequence: chunk.sequence,
							turnId,
						});
						if (isCurrentTurn()) {
							useInterviewRoomStore
								.getState()
								.markMicrophoneChunkSent(turnId, chunk.sequence);
						}
					},
					async onComplete(completion) {
						await startGate;
						if (!isCurrentTurn() || disposed || !socket.connected) return;
						await emitWithAck<AcceptedPayload>(socket, "microphone:end", {
							attemptId,
							lastSequence: completion.lastSequence,
							turnId,
						});
						if (!isCurrentTurn()) return;
						microphone = undefined;
						activeMicrophoneTurnId = undefined;
						rejectMicrophoneStartGate = undefined;
						microphoneStartVersion += 1;
						const currentRoom = useInterviewRoomStore.getState();
						currentRoom.finishMicrophoneTurn(turnId);
						currentRoom.setCaptureStatus("microphone", "idle");
					},
					onError(error) {
						if (!isCurrentTurn()) return;
						const shouldRetry =
							serverTurnAccepted &&
							socket.connected &&
							snapshotRef.current?.state === "LISTENING";
						reportError(error, "Microphone capture failed. Answer again.");
						microphone = undefined;
						activeMicrophoneTurnId = undefined;
						rejectMicrophoneStartGate = undefined;
						microphoneStarting = false;
						microphoneStartVersion += 1;
						const currentRoom = useInterviewRoomStore.getState();
						currentRoom.finishMicrophoneTurn(turnId);
						currentRoom.setCaptureStatus("microphone", "idle");
						if (shouldRetry) {
							queueMicrotask(() => void maybeStartMicrophone());
						}
					},
				},
				{
					endianness: "little",
					maxChunkBytes: 16 * 1024,
					maxTurnBytes: 8 * 1024 * 1024,
					vad: {
						minimumSpeechMs: 180,
						silenceDurationMs: 1_400,
						speechThreshold: 0.015,
					},
				},
			);
			microphone = controller;
			try {
				const result = await controller.start();
				if (!isCurrentTurn()) return;
				await emitWithAck<AcceptedPayload>(socket, "microphone:start", {
					attemptId,
					channels: 1,
					mimeType: "audio/l16",
					sampleRateHz: result.sampleRateHz,
					turnId,
				});
				if (!isCurrentTurn()) return;
				serverTurnAccepted = true;
				resolveStartGate();
				rejectMicrophoneStartGate = undefined;
				useInterviewRoomStore.getState().beginMicrophoneTurn(turnId);
			} catch (error) {
				rejectStartGate(error);
				await controller.cancel();
				if (!isCurrentTurn()) return;
				microphone = undefined;
				activeMicrophoneTurnId = undefined;
				rejectMicrophoneStartGate = undefined;
				microphoneStartVersion += 1;
				const currentRoom = useInterviewRoomStore.getState();
				currentRoom.finishMicrophoneTurn(turnId);
				currentRoom.setCaptureStatus("microphone", "idle");
				reportError(error, "The microphone turn could not start.");
			} finally {
				if (microphoneStartVersion === startVersion) {
					microphoneStarting = false;
				}
			}
		};
		afterAudioUnlockRef.current = maybeStartMicrophone;
		integrityControlRef.current = async (isPaused) => {
			if (disposed) return;
			reconcileStreamers();
			if (isPaused) {
				pauseDisposableMediaStreamers(cameraStreamer, screenStreamer);
				await Promise.all([
					interviewAudioPlayer.suspend(),
					cancelActiveMicrophone(),
				]);
				return;
			}

			await interviewAudioPlayer.resume();
			audioUnlockedRef.current = true;
			setAudioUnlockRequired(false);
			reconcileStreamers();
			if (useInterviewRoomStore.getState().playback.status === "idle") {
				resumeDisposableMediaStreamers(cameraStreamer, screenStreamer);
			}
			const snapshot = snapshotRef.current;
			if (socket.connected && snapshot?.state === "READY") {
				await emitWithAck<AcceptedPayload>(socket, "attempt:start", {
					attemptId,
					commandId: crypto.randomUUID(),
				});
			}
			await maybeStartMicrophone();
		};
		integrityReportRef.current = async (count) => {
			if (
				count === null ||
				!socket.connected ||
				useInterviewRoomStore.getState().connection.joinedAttemptId !==
					attemptId
			) {
				return;
			}
			await emitWithAck<AcceptedPayload>(socket, "integrity:status", {
				attemptId,
				detectedFaceCount: count,
			}).catch((error) =>
				reportError(error, "Face status could not be synchronized."),
			);
		};

		finishAnswerRef.current = async () => {
			if (microphone?.state !== "recording") return;
			try {
				await microphone.finish("manual");
			} catch (error) {
				reportError(error, "The current answer could not be submitted.");
			}
		};
		retryAssistantRef.current = async () => {
			if (!socket.connected) throw new Error("The interview is disconnected.");
			await emitWithAck<AcceptedPayload>(socket, "attempt:start", {
				attemptId,
				commandId: crypto.randomUUID(),
			});
			useInterviewRoomStore.getState().setLastError(null);
		};

		socket.on("attempt:snapshot", updateSnapshot);
		socket.on("attempt:state", (snapshot) => {
			updateSnapshot(snapshot);
			if (snapshot.state === "LISTENING") void maybeStartMicrophone();
		});
		socket.on("assistant:turn:start", ({ turnId }) => {
			setCandidateSubtitle("");
			stopPlayback();
			const audioRunning =
				interviewAudioPlayer.isRunning || integrityRef.current.paused;
			audioUnlockedRef.current = audioRunning;
			setAudioUnlockRequired(!audioRunning);
			try {
				interviewAudioPlayer.beginTurn(turnId);
				useInterviewRoomStore.getState().beginPlayback(turnId);
			} catch (error) {
				reportError(error, "Interviewer audio could not begin.");
			}
		});
		socket.on("assistant:subtitle", ({ text }) => setAssistantSubtitle(text));
		socket.on("assistant:audio:chunk", (chunk) => {
			pauseDisposableMediaStreamers(cameraStreamer, screenStreamer);
			const generation = playbackGeneration;
			playbackChain = playbackChain
				.then(async () => {
					if (disposed || generation !== playbackGeneration) return;
					const data = await toUint8Array(chunk.data);
					if (disposed || generation !== playbackGeneration) return;
					interviewAudioPlayer.enqueue({
						data,
						mimeType: chunk.mimeType,
						sequence: chunk.sequence,
						turnId: chunk.turnId,
					});
					useInterviewRoomStore
						.getState()
						.markPlaybackChunk(chunk.turnId, chunk.sequence);
				})
				.catch((error) => {
					if (generation === playbackGeneration) {
						reportError(
							error,
							"An interviewer audio chunk could not be played.",
						);
					}
				});
		});
		socket.on("assistant:turn:end", ({ turnId }) => {
			const generation = playbackGeneration;
			playbackChain = playbackChain
				.then(async () => {
					if (disposed || generation !== playbackGeneration) return;
					await interviewAudioPlayer.endTurn(turnId);
					if (disposed || generation !== playbackGeneration) return;
					if (!integrityRef.current.paused) {
						resumeDisposableMediaStreamers(cameraStreamer, screenStreamer);
					}
					useInterviewRoomStore.getState().finishPlayback(turnId);
					await maybeStartMicrophone();
				})
				.catch((error) => {
					if (generation !== playbackGeneration) return;
					stopPlayback();
					useInterviewRoomStore.getState().finishPlayback(turnId);
					reportError(error, "Interviewer audio could not finish.");
					void maybeStartMicrophone();
				});
		});
		socket.on("candidate:transcript", ({ text }) => {
			setCandidateSubtitle(text);
			void cache.invalidateQueries({
				queryKey: QUERY_KEYS.attempts.detail(attemptId),
			});
		});
		socket.on("attempt:ended", () => stopTerminalMedia());
		socket.on("attempt:error", (error) => {
			useInterviewRoomStore.getState().setLastError(error);
			if (
				error.code === "HTTP_400" &&
				microphone &&
				snapshotRef.current?.state === "LISTENING"
			) {
				discardActiveMicrophone();
				queueMicrotask(() => void maybeStartMicrophone());
			}
		});
		socket.on("connect_error", (error) => {
			reportError(error, "The realtime interview server is unavailable.");
			closeDisconnectedSession();
			socket.disconnect();
		});
		socket.on("disconnect", (reason) => {
			connectionVersion += 1;
			if (!disposed && reason !== "io client disconnect") {
				closeDisconnectedSession();
			}
		});
		socket.on("connect", () => {
			const connectedVersion = ++connectionVersion;
			startLatencySampling(connectedVersion);
			void (async () => {
				useInterviewRoomStore.getState().setConnectionStatus("connected");
				try {
					const snapshot = await emitWithAck<AttemptSnapshot>(
						socket,
						"attempt:join",
						{ attemptId },
					);
					if (
						disposed ||
						connectedVersion !== connectionVersion ||
						!socket.connected
					) {
						return;
					}
					useInterviewRoomStore.getState().setJoinedAttemptId(attemptId);
					updateSnapshot(snapshot);
					await syncMediaStatus();
					if (sessionClosed || !socket.connected) return;
					if (integrityRef.current.paused) {
						await integrityControlRef.current(true);
					}
					await integrityReportRef.current(
						integrityRef.current.detectedFaceCount,
					);
					if (
						!integrityRef.current.paused &&
						snapshot.state !== "COMPLETED" &&
						snapshot.state !== "FAILED"
					) {
						await emitWithAck<AcceptedPayload>(socket, "attempt:start", {
							attemptId,
							commandId: crypto.randomUUID(),
						});
					}
					if (
						disposed ||
						connectedVersion !== connectionVersion ||
						!socket.connected
					) {
						return;
					}
					if (snapshot.state === "LISTENING") await maybeStartMicrophone();
				} catch (error) {
					reportError(error, "The interview room could not be joined.");
					closeDisconnectedSession();
					socket.disconnect();
				}
			})();
		});

		const unsubscribeMedia = interviewMediaSession.subscribe(() => {
			void syncMediaStatus();
		});
		store.setConnectionStatus("connecting");
		socket.connect();

		return () => {
			disposed = true;
			stopLatencySampling();
			unsubscribeMedia();
			afterAudioUnlockRef.current = async () => undefined;
			integrityControlRef.current = async () => undefined;
			integrityReportRef.current = async () => undefined;
			finishAnswerRef.current = async () => undefined;
			retryAssistantRef.current = async () => undefined;
			const room = useInterviewRoomStore.getState();
			const snapshot = snapshotRef.current;
			const canClearPersistedMedia =
				socket.connected &&
				room.connection.joinedAttemptId === attemptId &&
				snapshot?.state !== "COMPLETED" &&
				snapshot?.state !== "FAILED";
			discardActiveMicrophone();
			stopStreamers();
			stopPlayback();
			if (canClearPersistedMedia) {
				socket.emit(
					"media:status",
					{
						attemptId,
						cameraActive: false,
						microphoneActive: false,
						screenActive: false,
					},
					() => undefined,
				);
			}
			room.setJoinedAttemptId(null);
			socket.removeAllListeners();
			socket.disconnect();
			interviewMediaSession.stopAll();
			room.reset();
		};
	}, [attemptId, cache, canConnect]);

	const finishAnswer = useCallback(() => finishAnswerRef.current(), []);
	const retryAssistant = useCallback(() => retryAssistantRef.current(), []);
	const clearError = useCallback(
		() => useInterviewRoomStore.getState().setLastError(null),
		[],
	);

	return {
		assistantSubtitle,
		attempt,
		audioUnlockRequired,
		candidateSubtitle,
		capture,
		clearError,
		connection,
		finishAnswer,
		lastError,
		latencyMs,
		playback,
		retryAssistant,
		unlockAudio,
	};
}
