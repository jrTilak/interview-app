import { jest } from "@jest/globals";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import type { Server } from "socket.io";
import type { AttemptSnapshot } from "#/modules/interview-attempts/dto/response.dto.js";
import type { InterviewAttemptsService } from "#/modules/interview-attempts/interview-attempts.service.js";
import type { InterviewOrchestratorService } from "#/modules/interview-attempts/interview-orchestrator.service.js";
import type { AppConfigService } from "#/types/index.js";
import type { AudioTurnBufferService } from "./audio-turn-buffer.service.js";
import { InterviewGateway } from "./interview.gateway.js";

const attemptId = "f0c765b0-a9fe-4a67-bf75-a63486949831";
const turnId = "19ad8c03-9e89-4d23-b393-d3cd6a654900";
const probeId = "536d1912-17b0-43f5-a08f-dc2dce239341";
const session = {
	user: {
		id: "4b8757d8-b56b-47eb-827f-65b14977fa25",
		name: "Ada Candidate",
		email: "ada@example.com",
	},
} as UserSession;

type GatewaySocket = Parameters<InterviewGateway["handleConnection"]>[0];
type GatewayMiddleware = (socket: GatewaySocket, next: () => void) => void;

/** Creates one inspectable Socket.IO client double for direct gateway calls. */
function socketDouble(
	id: string,
	input: {
		origin?: string;
		session?: UserSession;
		attemptId?: string;
	} = {},
) {
	return {
		id,
		handshake: { headers: { origin: input.origin } },
		data: { attemptId: input.attemptId },
		session: input.session,
		emit: jest.fn(),
		disconnect: jest.fn(),
		join: jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(),
	} as unknown as GatewaySocket;
}

/** Builds a public attempt snapshot with controlled state and media flags. */
function snapshot(
	state: AttemptSnapshot["state"],
	media: AttemptSnapshot["media"] = {
		cameraActive: false,
		screenActive: false,
		microphoneActive: false,
	},
): AttemptSnapshot {
	return {
		id: attemptId,
		state,
		startedAt: null,
		deadlineAt: null,
		endedAt: null,
		endReason: null,
		media,
		turns: [],
	};
}

/** Constructs the gateway with concise provider, persistence, and room doubles. */
function createGateway(flagOverrides: Record<string, boolean> = {}) {
	const attempts = {
		findSnapshot: jest
			.fn<(...args: unknown[]) => Promise<AttemptSnapshot>>()
			.mockResolvedValue(snapshot("READY")),
		start: jest.fn(),
		assertListening: jest
			.fn<(...args: unknown[]) => Promise<void>>()
			.mockResolvedValue(),
		updateMedia: jest.fn(),
		failForIntegrity:
			jest.fn<(...args: unknown[]) => Promise<AttemptSnapshot>>(),
	};
	const orchestrator = {
		start: jest.fn(),
		handleDeadline: jest.fn(),
		processCandidateAudio: jest.fn(),
	};
	const audioBuffers = {
		start: jest.fn(),
		append: jest.fn(),
		finish: jest.fn(),
		clear: jest.fn(),
	};
	const getSession = jest
		.fn<(...args: unknown[]) => Promise<UserSession | null>>()
		.mockResolvedValue(session);
	const configValues: Record<string, unknown> = {
		NODE_ENV: "production",
		API_CORS_ORIGINS: "https://client.example",
		MEDIA_MAX_CHUNK_BYTES: 512 * 1024,
	};
	const config = {
		get: (key: string) => configValues[key],
	} as unknown as AppConfigService;
	const devFlags = {
		get: () => ({
			faceDetectionEnabled: true,
			requireSingleFaceToStart: true,
			pauseOnNoFace: true,
			pauseOnMultipleFaces: true,
			terminateOnNoFace: false,
			terminateOnMultipleFaces: false,
			streamCameraToServer: true,
			streamScreenToServer: true,
			requireWholeScreen: true,
			...flagOverrides,
		}),
	};
	const gateway = new InterviewGateway(
		attempts as unknown as InterviewAttemptsService,
		orchestrator as unknown as InterviewOrchestratorService,
		audioBuffers as unknown as AudioTurnBufferService,
		{ instance: { api: { getSession } } } as never,
		devFlags as never,
		config,
	);
	const roomEmit = jest.fn();
	const to = jest.fn(() => ({ emit: roomEmit }));
	gateway.server = { to } as unknown as Server;
	return { gateway, attempts, audioBuffers, getSession, roomEmit };
}

describe("InterviewGateway", () => {
	it("rejects an untrusted handshake before reading its session", async () => {
		const { gateway, getSession } = createGateway();
		const client = socketDouble("socket-untrusted", {
			origin: "https://evil.example",
		});
		let middleware: GatewayMiddleware | undefined;
		const server = {
			use: jest.fn<(candidate: GatewayMiddleware) => void>((candidate) => {
				middleware = candidate;
			}),
		};
		gateway.afterInit(server as unknown as Server);
		if (!middleware) throw new Error("Gateway middleware was not installed");

		await new Promise<void>((resolve) => middleware?.(client, resolve));
		gateway.handleConnection(client);

		expect(getSession).not.toHaveBeenCalled();
		expect(client.emit).toHaveBeenCalledWith(
			"attempt:error",
			expect.objectContaining({ code: "UNTRUSTED_ORIGIN" }),
		);
		expect(client.disconnect).toHaveBeenCalledWith(true);
	});

	it("limits concurrent sockets per user and releases capacity on disconnect", () => {
		const { gateway } = createGateway();
		const clients = ["one", "two", "three"].map((id) =>
			socketDouble(id, { session }),
		);
		const firstClient = clients[0];
		if (!firstClient) throw new Error("Expected a connected client");
		for (const client of clients) gateway.handleConnection(client);
		const rejected = socketDouble("four", { session });

		gateway.handleConnection(rejected);

		expect(rejected.emit).toHaveBeenCalledWith(
			"attempt:error",
			expect.objectContaining({ code: "CONNECTION_LIMIT" }),
		);
		expect(rejected.disconnect).toHaveBeenCalledWith(true);

		gateway.handleDisconnect(firstClient);
		const replacement = socketDouble("replacement", { session });
		gateway.handleConnection(replacement);
		expect(replacement.disconnect).not.toHaveBeenCalled();
	});

	it("acknowledges an authenticated connection probe without joining an attempt", async () => {
		const { gateway, attempts, audioBuffers } = createGateway();
		const client = socketDouble("latency-probe", { session });

		const acknowledgement = await gateway.pingConnection(client, { probeId });

		expect(acknowledgement).toEqual({
			ok: true,
			data: {
				probeId,
				serverTime: expect.any(String),
			},
		});
		if (!acknowledgement.ok) throw new Error("Expected a successful probe");
		expect(new Date(acknowledgement.data.serverTime).toISOString()).toBe(
			acknowledgement.data.serverTime,
		);
		expect(client.join).not.toHaveBeenCalled();
		expect(attempts.findSnapshot).not.toHaveBeenCalled();
		expect(attempts.start).not.toHaveBeenCalled();
		expect(attempts.assertListening).not.toHaveBeenCalled();
		expect(attempts.updateMedia).not.toHaveBeenCalled();
		expect(audioBuffers.start).not.toHaveBeenCalled();
		expect(audioBuffers.append).not.toHaveBeenCalled();
		expect(audioBuffers.finish).not.toHaveBeenCalled();
	});

	it("rejects unauthenticated or invalid connection probes", async () => {
		const { gateway, attempts } = createGateway();
		const unauthenticated = socketDouble("unauthenticated-probe");
		const authenticated = socketDouble("invalid-probe", { session });

		await expect(
			gateway.pingConnection(unauthenticated, { probeId }),
		).resolves.toEqual({
			ok: false,
			error: expect.objectContaining({ code: "HTTP_401" }),
		});
		await expect(
			gateway.pingConnection(authenticated, { probeId, extra: true }),
		).resolves.toEqual({
			ok: false,
			error: expect.objectContaining({ code: "INVALID_EVENT" }),
		});
		expect(unauthenticated.join).not.toHaveBeenCalled();
		expect(authenticated.join).not.toHaveBeenCalled();
		expect(attempts.findSnapshot).not.toHaveBeenCalled();
		expect(unauthenticated.emit).toHaveBeenCalledWith(
			"attempt:error",
			expect.objectContaining({ code: "HTTP_401" }),
		);
		expect(authenticated.emit).toHaveBeenCalledWith(
			"attempt:error",
			expect.objectContaining({ code: "INVALID_EVENT" }),
		);
	});

	it("permits only one microphone owner and releases it on disconnect", async () => {
		const { gateway, audioBuffers } = createGateway();
		const first = socketDouble("first", { session, attemptId });
		const second = socketDouble("second", { session, attemptId });
		const payload = {
			attemptId,
			turnId,
			mimeType: "audio/wav",
			channels: 1,
		};

		await expect(gateway.startMicrophone(first, payload)).resolves.toEqual(
			expect.objectContaining({ ok: true }),
		);
		await expect(gateway.startMicrophone(second, payload)).resolves.toEqual(
			expect.objectContaining({
				ok: false,
				error: expect.objectContaining({ code: "HTTP_409" }),
			}),
		);

		gateway.handleDisconnect(first);
		await expect(gateway.startMicrophone(second, payload)).resolves.toEqual(
			expect.objectContaining({ ok: true }),
		);
		expect(audioBuffers.clear).toHaveBeenCalledWith(first.id);
		expect(audioBuffers.start).toHaveBeenCalledTimes(2);
	});

	it("rejects disposable media in inactive states or without its active flag", async () => {
		const { gateway, attempts } = createGateway();
		const client = socketDouble("candidate", { session, attemptId });
		const activeCamera = snapshot("READY", {
			cameraActive: true,
			screenActive: false,
			microphoneActive: false,
		});
		const inactiveScreen = snapshot("LISTENING");
		attempts.findSnapshot
			.mockResolvedValueOnce(activeCamera)
			.mockResolvedValueOnce(inactiveScreen);
		const media = {
			attemptId,
			sequence: 0,
			mimeType: "video/webm",
			data: Buffer.from("media"),
		};

		await gateway.joinAttempt(client, { attemptId });
		await expect(gateway.acceptCameraChunk(client, media)).resolves.toEqual(
			expect.objectContaining({
				ok: false,
				error: expect.objectContaining({ code: "HTTP_409" }),
			}),
		);

		await gateway.joinAttempt(client, { attemptId });
		await expect(gateway.acceptScreenChunk(client, media)).resolves.toEqual(
			expect.objectContaining({
				ok: false,
				error: expect.objectContaining({ code: "HTTP_409" }),
			}),
		);
	});

	it("terminates an active attempt when a global face rule is violated", async () => {
		const { gateway, attempts, audioBuffers, roomEmit } = createGateway({
			terminateOnMultipleFaces: true,
		});
		const failed = snapshot("FAILED");
		attempts.failForIntegrity.mockResolvedValue(failed);
		const client = socketDouble("integrity-candidate", {
			attemptId,
			session,
		});

		await expect(
			gateway.updateIntegrityStatus(client, {
				attemptId,
				detectedFaceCount: 2,
			}),
		).resolves.toEqual(expect.objectContaining({ ok: true }));

		expect(attempts.failForIntegrity).toHaveBeenCalledWith(
			attemptId,
			session.user,
		);
		expect(audioBuffers.clear).toHaveBeenCalledWith(client.id);
		expect(roomEmit).toHaveBeenCalledWith("attempt:state", failed);
		expect(roomEmit).toHaveBeenCalledWith(
			"attempt:error",
			expect.objectContaining({ code: "INTEGRITY_TERMINATED" }),
		);
	});
});
