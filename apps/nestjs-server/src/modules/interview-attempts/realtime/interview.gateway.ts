import {
	BadRequestException,
	ConflictException,
	HttpException,
	HttpStatus,
	Inject,
	type OnApplicationShutdown,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
} from "@nestjs/websockets";
import {
	ConnectedSocket,
	MessageBody,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from "@nestjs/websockets";
import { AuthService, type UserSession } from "@thallesp/nestjs-better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { Server, Socket } from "socket.io";
import type z from "zod";
import type { AppConfigService } from "../../../types/index.js";
import type { AttemptSnapshot } from "../dto/response.dto.js";
import { InterviewAttemptsService } from "../interview-attempts.service.js";
import { InterviewOrchestratorService } from "../interview-orchestrator.service.js";
import { AudioTurnBufferService } from "./audio-turn-buffer.service.js";
import {
	AttemptJoinEventSchema,
	AttemptStartEventSchema,
	type BufferedCandidateAudio,
	type ConnectionPingAckData,
	ConnectionPingEventSchema,
	DisposableMediaChunkEventSchema,
	type InterviewEventEmitter,
	MediaStatusEventSchema,
	MicrophoneChunkEventSchema,
	MicrophoneEndEventSchema,
	MicrophoneStartEventSchema,
	type RealtimeErrorPayload,
} from "./interview-realtime.protocol.js";

type InterviewSocket = Socket & {
	session?: UserSession;
	data: Socket["data"] & {
		attemptId?: string;
		microphoneAttemptId?: string;
		userId?: string;
		connectionError?: RealtimeErrorPayload;
	};
};

type MediaWindow = { startedAt: number; events: number; bytes: number };

type Acknowledgement<T = unknown> =
	| { ok: true; data: T }
	| { ok: false; error: RealtimeErrorPayload };

@WebSocketGateway({
	namespace: "/interviews",
	cors: { origin: true, credentials: true },
	maxHttpBufferSize: 1024 * 1024,
})
export class InterviewGateway
	implements
		OnGatewayInit,
		OnGatewayConnection,
		OnGatewayDisconnect,
		OnApplicationShutdown
{
	private static readonly _MAX_MEDIA_BYTES_PER_WINDOW = 20 * 1024 * 1024;
	private static readonly _MAX_MEDIA_EVENTS_PER_WINDOW = 120;
	private static readonly _MAX_SOCKETS_PER_USER = 3;
	private static readonly _MEDIA_WINDOW_MS = 10_000;
	private readonly _attemptSnapshots = new Map<string, AttemptSnapshot>();
	private readonly _deadlineTimers = new Map<string, NodeJS.Timeout>();
	private readonly _mediaWindows = new Map<string, MediaWindow>();
	private readonly _microphoneOwners = new Map<string, string>();
	private readonly _socketCounts = new Map<string, number>();

	@WebSocketServer()
	server!: Server;

	constructor(
		private readonly _attempts: InterviewAttemptsService,
		private readonly _orchestrator: InterviewOrchestratorService,
		private readonly _audioBuffers: AudioTurnBufferService,
		private readonly _authService: AuthService,
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
	) {}

	/** Parses a strict event schema and lets Zod errors become safe ack errors. */
	private _parse<T>(schema: z.ZodType<T>, payload: unknown): T {
		return schema.parse(payload);
	}

	/** Maps internal exceptions to a stable realtime error without leaking details. */
	private _toRealtimeError(error: unknown): RealtimeErrorPayload {
		if (error instanceof HttpException) {
			return {
				code: `HTTP_${error.getStatus()}`,
				message: error.message,
				retryable: error.getStatus() >= 500,
			};
		}
		if (error instanceof Error && error.name === "ZodError") {
			return {
				code: "INVALID_EVENT",
				message: "Realtime event validation failed",
				retryable: false,
			};
		}
		return {
			code: "INTERNAL_ERROR",
			message: "Realtime operation failed",
			retryable: true,
		};
	}

	/** Runs one event operation and mirrors failures to both event and ack. */
	private async _acknowledge<T>(
		client: InterviewSocket,
		operation: () => Promise<T> | T,
	): Promise<Acknowledgement<T>> {
		try {
			return { ok: true, data: await operation() };
		} catch (error) {
			const mapped = this._toRealtimeError(error);
			client.emit("attempt:error", mapped);
			return { ok: false, error: mapped };
		}
	}

	/** Verifies every event targets the attempt joined by this socket. */
	private _assertJoined(client: InterviewSocket, attemptId: string): void {
		if (client.data.attemptId !== attemptId) {
			throw new ConflictException(
				"Join this attempt before sending interview media",
			);
		}
	}

	/** Returns the handshake-bound session without a database read per chunk. */
	private _session(client: InterviewSocket): UserSession {
		if (!client.session)
			throw new UnauthorizedException("Authentication required");
		return client.session;
	}

	/** Enforces aggregate disposable-media event and byte limits per socket. */
	private _consumeDisposableMedia(socketId: string, bytes: number): void {
		const now = Date.now();
		const current = this._mediaWindows.get(socketId);
		const window =
			current && current.startedAt + InterviewGateway._MEDIA_WINDOW_MS > now
				? current
				: { startedAt: now, events: 0, bytes: 0 };
		if (
			window.events + 1 > InterviewGateway._MAX_MEDIA_EVENTS_PER_WINDOW ||
			window.bytes + bytes > InterviewGateway._MAX_MEDIA_BYTES_PER_WINDOW
		) {
			throw new HttpException(
				"Realtime media rate limit exceeded",
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}
		window.events += 1;
		window.bytes += bytes;
		this._mediaWindows.set(socketId, window);
	}

	/** Releases an attempt's one transient microphone reservation. */
	private _releaseMicrophone(client: InterviewSocket): void {
		const attemptId = client.data.microphoneAttemptId;
		if (attemptId && this._microphoneOwners.get(attemptId) === client.id) {
			this._microphoneOwners.delete(attemptId);
		}
		delete client.data.microphoneAttemptId;
	}

	/** Authenticates the handshake before Socket.IO reports a connected client. */
	private async _prepareConnection(client: InterviewSocket): Promise<void> {
		const origin = client.handshake.headers.origin;
		const allowedOrigins = new Set(
			this._config
				.get("API_CORS_ORIGINS", { infer: true })
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		);
		const originRequired =
			this._config.get("NODE_ENV", { infer: true }) === "production";
		if (
			(originRequired && !origin) ||
			(origin && !allowedOrigins.has(origin))
		) {
			client.data.connectionError = {
				code: "UNTRUSTED_ORIGIN",
				message: "Socket origin is not allowed",
				retryable: false,
			};
			return;
		}

		const session = await this._authService.instance.api.getSession({
			headers: fromNodeHeaders(client.handshake.headers),
		});
		if (!session) {
			client.data.connectionError = {
				code: "UNAUTHORIZED",
				message: "Authentication is required",
				retryable: false,
			};
			return;
		}
		client.session = session as UserSession;
	}

	/** Creates a room emitter and clears completed attempt timers. */
	private _roomEmitter(attemptId: string): InterviewEventEmitter {
		return (event, payload) => {
			if (event === "attempt:state") {
				this._attemptSnapshots.set(attemptId, payload as AttemptSnapshot);
			}
			this.server.to(`attempt:${attemptId}`).emit(event, payload);
			if (event === "attempt:ended") {
				const timer = this._deadlineTimers.get(attemptId);
				if (timer) clearTimeout(timer);
				this._deadlineTimers.delete(attemptId);
				this._attemptSnapshots.delete(attemptId);
			}
		};
	}

	/** Schedules the persisted hard deadline without relying on it for integrity. */
	private _scheduleDeadline(
		attemptId: string,
		deadlineAt: string | null,
		candidate: UserSession["user"],
	): void {
		const current = this._deadlineTimers.get(attemptId);
		if (current) clearTimeout(current);
		if (!deadlineAt) return;
		const timer = setTimeout(
			() => {
				void this._orchestrator
					.handleDeadline(attemptId, candidate, this._roomEmitter(attemptId))
					.catch((error) => {
						this.server
							.to(`attempt:${attemptId}`)
							.emit("attempt:error", this._toRealtimeError(error));
					});
			},
			Math.max(0, new Date(deadlineAt).getTime() - Date.now()),
		);
		this._deadlineTimers.set(attemptId, timer);
	}

	/** Finishes buffered microphone input and starts asynchronous orchestration. */
	private _finishAudio(
		client: InterviewSocket,
		candidate: UserSession["user"],
		identity?: { attemptId: string; turnId: string; lastSequence: number },
	): void {
		let audio: BufferedCandidateAudio;
		try {
			audio = this._audioBuffers.finish(client.id, identity);
		} catch (error) {
			if (!identity || error instanceof BadRequestException) {
				this._releaseMicrophone(client);
			}
			throw error;
		}
		this._releaseMicrophone(client);
		void this._orchestrator
			.processCandidateAudio(
				audio,
				candidate,
				this._roomEmitter(audio.attemptId),
			)
			.catch((error) => {
				client.emit("attempt:error", this._toRealtimeError(error));
			});
	}

	/** Applies the shared disposable camera/screen media policy. */
	private async _acceptDisposableChunk(
		client: InterviewSocket,
		payload: unknown,
		mediaType: "camera" | "screen",
	): Promise<Acknowledgement> {
		return this._acknowledge(client, async () => {
			this._session(client);
			const event = this._parse(DisposableMediaChunkEventSchema, payload);
			this._assertJoined(client, event.attemptId);
			const byteLength = Buffer.isBuffer(event.data)
				? event.data.byteLength
				: event.data instanceof Uint8Array
					? event.data.byteLength
					: -1;
			if (
				byteLength < 0 ||
				byteLength > this._config.get("MEDIA_MAX_CHUNK_BYTES", { infer: true })
			) {
				throw new ConflictException("Media chunk is invalid or too large");
			}
			this._consumeDisposableMedia(client.id, byteLength);
			const snapshot = this._attemptSnapshots.get(event.attemptId);
			if (
				!snapshot ||
				!["ASSISTANT_SPEAKING", "LISTENING", "PROCESSING"].includes(
					snapshot.state,
				)
			) {
				throw new ConflictException("Interview is not accepting media now");
			}
			const active =
				mediaType === "camera"
					? snapshot.media.cameraActive
					: snapshot.media.screenActive;
			if (!active) {
				throw new ConflictException(`${mediaType} sharing is not active`);
			}
			return { accepted: true };
		});
	}

	/** Installs awaited namespace authentication before the connection event. */
	afterInit(server: Server): void {
		server.use((socket, next) => {
			void this._prepareConnection(socket as InterviewSocket)
				.catch(() => {
					(socket as InterviewSocket).data.connectionError = {
						code: "INTERNAL_ERROR",
						message: "Realtime authentication failed",
						retryable: true,
					};
				})
				.finally(next);
		});
	}

	/** Rejects failed handshakes and records bounded authenticated connections. */
	handleConnection(client: InterviewSocket): void {
		if (client.data.connectionError) {
			client.emit("attempt:error", client.data.connectionError);
			client.disconnect(true);
			return;
		}
		const typedSession = client.session;
		if (!typedSession) {
			client.emit("attempt:error", {
				code: "UNAUTHORIZED",
				message: "Authentication is required",
				retryable: false,
			});
			client.disconnect(true);
			return;
		}
		const socketCount = this._socketCounts.get(typedSession.user.id) ?? 0;
		if (socketCount >= InterviewGateway._MAX_SOCKETS_PER_USER) {
			client.emit("attempt:error", {
				code: "CONNECTION_LIMIT",
				message: "Too many interview connections are open",
				retryable: true,
			});
			client.disconnect(true);
			return;
		}
		client.session = typedSession;
		client.data.userId = typedSession.user.id;
		this._socketCounts.set(typedSession.user.id, socketCount + 1);
	}

	/** Releases all transient audio held for a disconnected socket. */
	handleDisconnect(client: InterviewSocket): void {
		this._audioBuffers.clear(client.id);
		this._releaseMicrophone(client);
		this._mediaWindows.delete(client.id);
		const userId = client.data.userId;
		if (userId) {
			const next = (this._socketCounts.get(userId) ?? 1) - 1;
			if (next <= 0) this._socketCounts.delete(userId);
			else this._socketCounts.set(userId, next);
		}
	}

	/** Clears deadline handles so shutdown never waits on long interviews. */
	onApplicationShutdown(): void {
		for (const timer of this._deadlineTimers.values()) clearTimeout(timer);
		this._deadlineTimers.clear();
		this._attemptSnapshots.clear();
		this._mediaWindows.clear();
		this._microphoneOwners.clear();
		this._socketCounts.clear();
	}

	/** Measures authenticated transport latency without joining or reading an attempt. */
	@SubscribeMessage("connection:ping")
	async pingConnection(
		@ConnectedSocket() client: InterviewSocket,
		@MessageBody() payload: unknown,
	): Promise<Acknowledgement<ConnectionPingAckData>> {
		return this._acknowledge(client, () => {
			this._session(client);
			const { probeId } = this._parse(ConnectionPingEventSchema, payload);
			return { probeId, serverTime: new Date().toISOString() };
		});
	}

	/** Authorizes the socket, joins its private room, and returns current state. */
	@SubscribeMessage("attempt:join")
	async joinAttempt(
		@ConnectedSocket() client: InterviewSocket,
		@MessageBody() payload: unknown,
	): Promise<Acknowledgement> {
		return this._acknowledge(client, async () => {
			const session = this._session(client);
			const { attemptId } = this._parse(AttemptJoinEventSchema, payload);
			const snapshot = await this._attempts.findSnapshot(
				attemptId,
				session.user,
			);
			await client.join(`attempt:${attemptId}`);
			client.data.attemptId = attemptId;
			this._attemptSnapshots.set(attemptId, snapshot);
			this._scheduleDeadline(attemptId, snapshot.deadlineAt, session.user);
			client.emit("attempt:snapshot", snapshot);
			return snapshot;
		});
	}

	/** Idempotently starts or resumes the model interviewer. */
	@SubscribeMessage("attempt:start")
	async startAttempt(
		@ConnectedSocket() client: InterviewSocket,
		@MessageBody() payload: unknown,
	): Promise<Acknowledgement> {
		return this._acknowledge(client, async () => {
			const session = this._session(client);
			const { attemptId } = this._parse(AttemptStartEventSchema, payload);
			this._assertJoined(client, attemptId);
			const result = await this._attempts.start(attemptId, session.user);
			this._scheduleDeadline(
				attemptId,
				result.snapshot.deadlineAt,
				session.user,
			);
			this._attemptSnapshots.set(attemptId, result.snapshot);
			this.server
				.to(`attempt:${attemptId}`)
				.emit("attempt:state", result.snapshot);
			void this._orchestrator.start(
				attemptId,
				session.user,
				this._roomEmitter(attemptId),
			);
			return { accepted: true };
		});
	}

	/** Opens a candidate microphone turn while the attempt is listening. */
	@SubscribeMessage("microphone:start")
	async startMicrophone(
		@ConnectedSocket() client: InterviewSocket,
		@MessageBody() payload: unknown,
	): Promise<Acknowledgement> {
		return this._acknowledge(client, async () => {
			const session = this._session(client);
			const event = this._parse(MicrophoneStartEventSchema, payload);
			this._assertJoined(client, event.attemptId);
			await this._attempts.assertListening(event.attemptId, session.user);
			const owner = this._microphoneOwners.get(event.attemptId);
			if (owner && owner !== client.id) {
				throw new ConflictException(
					"Another connection already owns the microphone turn",
				);
			}
			this._audioBuffers.start(client.id, event, () => {
				try {
					this._finishAudio(client, session.user);
				} catch (error) {
					client.emit("attempt:error", this._toRealtimeError(error));
				}
			});
			this._microphoneOwners.set(event.attemptId, client.id);
			client.data.microphoneAttemptId = event.attemptId;
			return { accepted: true };
		});
	}

	/** Appends one strictly ordered binary microphone chunk. */
	@SubscribeMessage("microphone:chunk")
	async appendMicrophone(
		@ConnectedSocket() client: InterviewSocket,
		@MessageBody() payload: unknown,
	): Promise<Acknowledgement> {
		return this._acknowledge(client, () => {
			this._session(client);
			const event = this._parse(MicrophoneChunkEventSchema, payload);
			this._assertJoined(client, event.attemptId);
			this._audioBuffers.append(
				client.id,
				{
					attemptId: event.attemptId,
					turnId: event.turnId,
					sequence: event.sequence,
				},
				event.data,
			);
			return { accepted: true };
		});
	}

	/** Closes microphone input explicitly; inactivity provides a fallback. */
	@SubscribeMessage("microphone:end")
	async endMicrophone(
		@ConnectedSocket() client: InterviewSocket,
		@MessageBody() payload: unknown,
	): Promise<Acknowledgement> {
		return this._acknowledge(client, () => {
			const session = this._session(client);
			const event = this._parse(MicrophoneEndEventSchema, payload);
			this._assertJoined(client, event.attemptId);
			this._finishAudio(client, session.user, event);
			return { accepted: true };
		});
	}

	/** Persists only camera/screen/microphone status, never media bytes. */
	@SubscribeMessage("media:status")
	async updateMediaStatus(
		@ConnectedSocket() client: InterviewSocket,
		@MessageBody() payload: unknown,
	): Promise<Acknowledgement> {
		return this._acknowledge(client, async () => {
			const session = this._session(client);
			const event = this._parse(MediaStatusEventSchema, payload);
			this._assertJoined(client, event.attemptId);
			const snapshot = await this._attempts.updateMedia(
				event.attemptId,
				session.user,
				event,
			);
			this._attemptSnapshots.set(event.attemptId, snapshot);
			this.server
				.to(`attempt:${event.attemptId}`)
				.emit("attempt:state", snapshot);
			return snapshot.media;
		});
	}

	/** Authenticates, bounds, accepts, and immediately discards a camera chunk. */
	@SubscribeMessage("camera:chunk")
	async acceptCameraChunk(
		@ConnectedSocket() client: InterviewSocket,
		@MessageBody() payload: unknown,
	): Promise<Acknowledgement> {
		return this._acceptDisposableChunk(client, payload, "camera");
	}

	/** Authenticates, bounds, accepts, and immediately discards a screen chunk. */
	@SubscribeMessage("screen:chunk")
	async acceptScreenChunk(
		@ConnectedSocket() client: InterviewSocket,
		@MessageBody() payload: unknown,
	): Promise<Acknowledgement> {
		return this._acceptDisposableChunk(client, payload, "screen");
	}
}
