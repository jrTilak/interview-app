import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { AppModule } from "#/app.module.js";
import { type AppDatabase, DATABASE } from "#/db/database.provider.js";
import { interviewAttempt } from "#/db/schema/index.js";
import {
	INTERVIEW_LLM,
	type InterviewLlmPort,
} from "#/modules/ai/llm/llm.port.js";
import {
	SPEECH_TO_TEXT,
	type SpeechToTextPort,
} from "#/modules/ai/stt/stt.port.js";
import {
	TEXT_TO_SPEECH,
	type TextToSpeechPort,
} from "#/modules/ai/tts/tts.port.js";
import { InterviewAttemptsService } from "#/modules/interview-attempts/interview-attempts.service.js";
import { OpenApiService } from "#/modules/open-api/open-api.service.js";
import type { AppConfigService } from "#/types/index.js";

class FakeInterviewLlm implements InterviewLlmPort {
	structureCalls = 0;
	turnCalls = 0;

	/** Produces deterministic tasks while retaining a provider-failure branch. */
	async structureQuestions(
		input: Parameters<InterviewLlmPort["structureQuestions"]>[0],
	) {
		this.structureCalls += 1;
		if (input.rawQuestions.includes("[FAIL]"))
			throw new Error("simulated provider failure");
		return [
			{
				title: "React state",
				prompt: "Explain how React state updates work.",
				objective: null,
				followUpGuidance: "Ask for a practical example.",
			},
			{
				title: "Difficult bug",
				prompt: "Tell me about a difficult bug you solved.",
				objective: null,
				followUpGuidance: null,
			},
		];
	}

	/** Drives a greeting, remaining tasks, and an explicit end tool call. */
	async generateTurn(input: Parameters<InterviewLlmPort["generateTurn"]>[0]) {
		this.turnCalls += 1;
		if (input.mustEnd) {
			return {
				text: "Thank you for your time. The interview is now complete.",
				actions: [{ type: "end_interview" as const, reason: "Time limit" }],
			};
		}
		const pending = input.tasks.filter((task) => !task.completed);
		const current = pending[0];
		const next = pending[1];
		if (!current) {
			return {
				text: "Thank you for your time. The interview is now complete.",
				actions: [
					{ type: "end_interview" as const, reason: "All tasks asked" },
				],
			};
		}
		if (current.turnCount === 0) {
			return {
				text: `Hello ${input.candidate.name}. What experience have you had with ${current.title.toLowerCase()}?`,
				actions: [],
			};
		}
		if (next) {
			return {
				text: `Thank you for that context. Could you walk me through your experience with ${next.title.toLowerCase()}?`,
				actions: [
					{
						type: "complete_questions" as const,
						questionIds: [current.id],
					},
				],
			};
		}
		return {
			text: "Thank you for sharing that. This concludes the interview.",
			actions: [
				{
					type: "complete_questions" as const,
					questionIds: [current.id],
				},
				{ type: "end_interview" as const, reason: "All tasks asked" },
			],
		};
	}
}

const fakeSpeechToText: SpeechToTextPort = {
	/** Returns a stable transcript without sending test bytes to a provider. */
	async transcribe() {
		return "This is my candidate answer.";
	},
};

const fakeTextToSpeech: TextToSpeechPort = {
	/** Returns one deterministic PCM-like response for realtime assertions. */
	async synthesize() {
		return {
			bytes: Buffer.from("fake-pcm"),
			mimeType: "audio/l16",
			sampleRateHz: 24_000,
			channels: 1,
		};
	},
};

type Ack<T = any> = { ok: boolean; data?: T; error?: { code: string } };

/** Extracts the first cookie pair from a Better Auth response. */
function responseCookie(response: request.Response): string {
	const header = response.headers["set-cookie"];
	const raw = Array.isArray(header) ? header[0] : header;
	if (!raw) throw new Error("Authentication response did not set a cookie");
	return raw.split(";")[0] ?? raw;
}

/** Emits one Socket.IO command and resolves its acknowledgement. */
function emitAck<T = any>(
	socket: Socket,
	event: string,
	payload: unknown,
): Promise<Ack<T>> {
	return new Promise((resolve, reject) => {
		(socket as any)
			.timeout(5_000)
			.emit(event, payload, (error: Error | null, acknowledgement: Ack<T>) => {
				if (error) reject(error);
				else resolve(acknowledgement);
			});
	});
}

/** Waits for the next matching server event with a bounded timeout. */
function waitForEvent<T = any>(
	socket: Socket,
	event: string,
	predicate: (payload: T) => boolean = () => true,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.off(event, handler);
			reject(new Error(`Timed out waiting for ${event}`));
		}, 7_000);
		const handler = (payload: T) => {
			if (!predicate(payload)) return;
			clearTimeout(timer);
			socket.off(event, handler);
			resolve(payload);
		};
		socket.on(event, handler);
	});
}

describe("interview platform end to end", () => {
	let app: INestApplication;
	let baseUrl: string;
	let fakeLlm: FakeInterviewLlm;
	let ownerCookie: string;
	let candidateCookie: string;
	let candidateUser: any;
	let ownerInterviewId: string;
	let attemptId: string;
	const sockets = new Set<Socket>();

	/** Registers a client so failed realtime assertions cannot leak open sockets. */
	function trackSocket(socket: Socket): Socket {
		sockets.add(socket);
		return socket;
	}

	/** Closes every client created by the current test. */
	function closeSockets(): void {
		for (const socket of sockets) socket.close();
		sockets.clear();
	}

	beforeAll(async () => {
		fakeLlm = new FakeInterviewLlm();
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(INTERVIEW_LLM)
			.useValue(fakeLlm)
			.overrideProvider(SPEECH_TO_TEXT)
			.useValue(fakeSpeechToText)
			.overrideProvider(TEXT_TO_SPEECH)
			.useValue(fakeTextToSpeech)
			.compile();
		app = moduleRef.createNestApplication({ bodyParser: false });
		const config = app.get<AppConfigService>(ConfigService);
		app.setGlobalPrefix(config.get("API_PREFIX", { infer: true }));
		app.enableCors({
			credentials: true,
			origin: config
				.get("API_CORS_ORIGINS", { infer: true })
				.split(",")
				.map((origin) => origin.trim())
				.filter(Boolean),
		});
		app.enableShutdownHooks();
		await app.get(OpenApiService).setup(app);
		await app.listen(0, "127.0.0.1");
		const address = app.getHttpServer().address();
		if (!address || typeof address === "string")
			throw new Error("Test port unavailable");
		baseUrl = `http://127.0.0.1:${address.port}`;
	});

	afterEach(closeSockets);

	afterAll(async () => {
		closeSockets();
		if (app) await app.close();
	});

	it("supports narrow Better Auth signup/login and protects domain routes", async () => {
		await request(app.getHttpServer())
			.get("/api")
			.expect(200, {
				message: "Retrieved successfully",
				data: { service: "interview-api", status: "ok" },
			});
		await request(app.getHttpServer())
			.get("/api/ready")
			.expect(200, {
				message: "Retrieved successfully",
				data: {
					service: "interview-api",
					status: "ok",
					dependencies: { database: "ok" },
				},
			});
		await request(app.getHttpServer()).get("/api/interviews").expect(401);
		const applicationSchema = await request(app.getHttpServer())
			.get("/api-docs.json")
			.expect(200);
		expect(applicationSchema.body.paths).toHaveProperty("/api/interviews");
		expect(applicationSchema.body.paths).toHaveProperty("/api/__flags__");
		expect(applicationSchema.body.paths).toHaveProperty("/api/interviews/{id}");
		expect(applicationSchema.body.paths).toHaveProperty(
			"/api/interviews/public/{id}",
		);
		const authSchema = await request(app.getHttpServer())
			.get("/auth-docs.json")
			.expect(200);
		const authPaths = Object.keys(authSchema.body.paths);
		expect(authPaths).toEqual(
			expect.arrayContaining([
				"/sign-up/email",
				"/sign-in/email",
				"/sign-out",
				"/get-session",
			]),
		);
		expect(authPaths).toHaveLength(4);
		await request(app.getHttpServer())
			.get("/api/auth/open-api/generate-schema")
			.expect(404);
		await request(app.getHttpServer()).get("/api/auth/reference").expect(404);

		const ownerSignup = await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.send({
				name: "Interview Owner",
				email: "owner@example.com",
				password: "owner-password-123",
			})
			.expect(200);
		expect(responseCookie(ownerSignup)).toContain("better-auth.session_token=");

		const ownerLogin = await request(app.getHttpServer())
			.post("/api/auth/sign-in/email")
			.send({ email: "owner@example.com", password: "owner-password-123" })
			.expect(200);
		ownerCookie = responseCookie(ownerLogin);

		const candidateSignup = await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.send({
				name: "Candidate Ada",
				email: "candidate-ada@example.com",
				password: "candidate-password-123",
			})
			.expect(200);
		candidateCookie = responseCookie(candidateSignup);
		candidateUser = candidateSignup.body.user;

		await request(app.getHttpServer())
			.get("/api/auth/get-session")
			.set("Cookie", candidateCookie)
			.expect(200)
			.expect(({ body }) =>
				expect(body.user.email).toBe("candidate-ada@example.com"),
			);
		await request(app.getHttpServer()).get("/api/__flags__").expect(401);
		const flags = await request(app.getHttpServer())
			.patch("/api/__flags__")
			.set("Cookie", ownerCookie)
			.send({ streamCameraToServer: true, streamScreenToServer: true })
			.expect(200);
		expect(flags.body.data).toMatchObject({
			streamCameraToServer: true,
			streamScreenToServer: true,
		});
		await request(app.getHttpServer())
			.post("/api/auth/request-password-reset")
			.send({ email: "owner@example.com" })
			.expect(404);
		for (const path of [
			"/api/auth/sign-in/social",
			"/api/auth/send-verification-email",
			"/api/auth/update-user",
			"/api/auth/reset-password/any-token",
		]) {
			await request(app.getHttpServer()).post(path).send({}).expect(404);
		}
	});

	it("creates a private interview and shares it explicitly by ID", async () => {
		const createBody = {
			title: "Junior React Developer",
			description: "A focused project interview",
			rawQuestions: "Ask about state and then about a difficult bug.",
			durationMinutes: 30,
			allowMultipleAttempts: true,
		};
		const created = await request(app.getHttpServer())
			.post("/api/interviews")
			.set("Cookie", ownerCookie)
			.send(createBody)
			.expect(201);
		ownerInterviewId = created.body.data.id;
		expect(created.body.data.questions).toHaveLength(2);
		expect(created.body.data.allowMultipleAttempts).toBe(true);
		expect(created.body.data.isPublic).toBe(false);
		expect(created.body.data).not.toHaveProperty("shareCode");
		expect(created.body.data).not.toHaveProperty("shareUrl");
		expect(fakeLlm.structureCalls).toBe(1);

		await request(app.getHttpServer())
			.post("/api/interviews")
			.set("Cookie", ownerCookie)
			.send({ ...createBody, clientRequestId: randomUUID() })
			.expect(422);

		const failed = await request(app.getHttpServer())
			.post("/api/interviews")
			.set("Cookie", ownerCookie)
			.send({
				...createBody,
				rawQuestions: "[FAIL] provider",
			})
			.expect(503);
		expect(failed.body).toEqual({
			message: "Whoops! Something went wrong on the server",
			error: null,
		});

		const list = await request(app.getHttpServer())
			.get("/api/interviews")
			.set("Cookie", ownerCookie)
			.expect(200);
		expect(list.body.data).toHaveLength(1);
		expect(list.body.data[0].questionCount).toBe(2);
		expect(list.body.data[0].allowMultipleAttempts).toBe(true);
		expect(list.body.data[0].isPublic).toBe(false);

		await request(app.getHttpServer())
			.get(`/api/interviews/public/${ownerInterviewId}`)
			.set("Cookie", candidateCookie)
			.expect(404);
		await request(app.getHttpServer())
			.post(`/api/shared-interviews/${ownerInterviewId}/attempts`)
			.set("Cookie", candidateCookie)
			.expect(404);

		const updated = await request(app.getHttpServer())
			.patch(`/api/interviews/${ownerInterviewId}`)
			.set("Cookie", ownerCookie)
			.send({ durationMinutes: 45, description: null, isPublic: true })
			.expect(200);
		expect(updated.body.data).toMatchObject({
			description: null,
			durationMinutes: 45,
			isPublic: true,
		});
		await request(app.getHttpServer())
			.patch(`/api/interviews/${ownerInterviewId}`)
			.set("Cookie", candidateCookie)
			.send({ isPublic: false })
			.expect(404);

		await request(app.getHttpServer())
			.get(`/api/interviews/${ownerInterviewId}`)
			.set("Cookie", candidateCookie)
			.expect(404);
		const preview = await request(app.getHttpServer())
			.get(`/api/interviews/public/${ownerInterviewId}`)
			.set("Cookie", candidateCookie)
			.expect(200);
		expect(preview.body.data.questionCount).toBe(2);
		expect(preview.body.data.allowMultipleAttempts).toBe(true);
		expect(preview.body.data).not.toHaveProperty("questions");
		expect(preview.body.data).not.toHaveProperty("rawQuestions");
		await request(app.getHttpServer())
			.get(`/api/interviews/public/${ownerInterviewId}`)
			.expect(200);

		const privateAgain = await request(app.getHttpServer())
			.patch(`/api/interviews/${ownerInterviewId}`)
			.set("Cookie", ownerCookie)
			.send({ isPublic: false })
			.expect(200);
		expect(privateAgain.body.data.isPublic).toBe(false);
		await request(app.getHttpServer())
			.get(`/api/interviews/public/${ownerInterviewId}`)
			.set("Cookie", candidateCookie)
			.expect(404);

		const publicAgain = await request(app.getHttpServer())
			.patch(`/api/interviews/${ownerInterviewId}`)
			.set("Cookie", ownerCookie)
			.send({ isPublic: true })
			.expect(200);
		expect(publicAgain.body.data).toMatchObject({
			id: ownerInterviewId,
			isPublic: true,
		});
	});

	it("creates one resumable candidate attempt per shared link", async () => {
		const created = await request(app.getHttpServer())
			.post(`/api/shared-interviews/${ownerInterviewId}/attempts`)
			.set("Cookie", candidateCookie)
			.expect(201);
		attemptId = created.body.data.id;
		expect(created.body.data.state).toBe("READY");

		const resumed = await request(app.getHttpServer())
			.post(`/api/shared-interviews/${ownerInterviewId}/attempts`)
			.set("Cookie", candidateCookie)
			.expect(201);
		expect(resumed.body.data.id).toBe(attemptId);
	});

	it("runs the complete authenticated realtime interview and closes by AI tool", async () => {
		const unauthenticated = trackSocket(
			io(`${baseUrl}/interviews`, {
				autoConnect: false,
				transports: ["websocket"],
				extraHeaders: { Origin: "http://localhost:5173" },
			}),
		);
		const unauthorizedError = waitForEvent<any>(
			unauthenticated,
			"attempt:error",
			(payload) => payload.code === "UNAUTHORIZED",
		);
		unauthenticated.connect();
		await unauthorizedError;
		unauthenticated.close();

		const ownerSocket = trackSocket(
			io(`${baseUrl}/interviews`, {
				transports: ["websocket"],
				extraHeaders: {
					Cookie: ownerCookie,
					Origin: "http://localhost:5173",
				},
			}),
		);
		await waitForEvent(ownerSocket, "connect");
		const forbiddenJoin = await emitAck(ownerSocket, "attempt:join", {
			attemptId,
		});
		expect(forbiddenJoin.ok).toBe(false);
		expect(forbiddenJoin.error?.code).toBe("HTTP_404");
		ownerSocket.close();

		const socket = trackSocket(
			io(`${baseUrl}/interviews`, {
				transports: ["websocket"],
				extraHeaders: {
					Cookie: candidateCookie,
					Origin: "http://localhost:5173",
				},
			}),
		);
		await waitForEvent(socket, "connect");
		const joined = await emitAck<any>(socket, "attempt:join", { attemptId });
		expect(joined.ok).toBe(true);
		expect(joined.data.state).toBe("READY");
		expect(
			await app
				.get(InterviewAttemptsService)
				.claimDeadline(attemptId, candidateUser),
		).toBe(false);

		expect(
			(
				await emitAck(socket, "media:status", {
					attemptId,
					cameraActive: true,
					screenActive: true,
					microphoneActive: false,
				})
			).ok,
		).toBe(true);
		expect(
			(
				await emitAck(socket, "camera:chunk", {
					attemptId,
					sequence: 0,
					mimeType: "video/webm",
					data: Buffer.from("too-early"),
				})
			).error?.code,
		).toBe("HTTP_409");

		const firstListening = waitForEvent<any>(
			socket,
			"attempt:state",
			(payload) => payload.state === "LISTENING",
		);
		expect(
			(
				await emitAck(socket, "attempt:start", {
					attemptId,
					commandId: randomUUID(),
				})
			).ok,
		).toBe(true);
		await firstListening;

		const media = await emitAck(socket, "media:status", {
			attemptId,
			cameraActive: true,
			screenActive: true,
			microphoneActive: true,
		});
		expect(media.ok).toBe(true);
		expect(
			(
				await emitAck(socket, "camera:chunk", {
					attemptId,
					sequence: 0,
					mimeType: "video/webm",
					data: Buffer.from("camera"),
				})
			).ok,
		).toBe(true);
		expect(
			(
				await emitAck(socket, "screen:chunk", {
					attemptId,
					sequence: 0,
					mimeType: "video/webm",
					data: Buffer.from("screen"),
				})
			).ok,
		).toBe(true);

		const firstCandidateTurnId = randomUUID();
		expect(
			(
				await emitAck(socket, "microphone:start", {
					attemptId,
					turnId: firstCandidateTurnId,
					mimeType: "audio/wav",
					sampleRateHz: 16_000,
					channels: 1,
				})
			).ok,
		).toBe(true);
		expect(
			(
				await emitAck(socket, "microphone:chunk", {
					attemptId,
					turnId: firstCandidateTurnId,
					sequence: 0,
					data: Buffer.from("candidate-audio-one"),
				})
			).ok,
		).toBe(true);
		const candidateTranscript = waitForEvent(socket, "candidate:transcript");
		const secondListening = waitForEvent<any>(
			socket,
			"attempt:state",
			(payload) => payload.state === "LISTENING",
		);
		expect(
			(
				await emitAck(socket, "microphone:end", {
					attemptId,
					turnId: firstCandidateTurnId,
					lastSequence: 0,
				})
			).ok,
		).toBe(true);
		await candidateTranscript;
		await secondListening;

		const replayedEnd = await emitAck(socket, "microphone:end", {
			attemptId,
			turnId: firstCandidateTurnId,
			lastSequence: 0,
		});
		expect(replayedEnd.ok).toBe(false);

		const secondCandidateTurnId = randomUUID();
		await emitAck(socket, "microphone:start", {
			attemptId,
			turnId: secondCandidateTurnId,
			mimeType: "audio/wav",
			channels: 1,
		});
		await emitAck(socket, "microphone:chunk", {
			attemptId,
			turnId: secondCandidateTurnId,
			sequence: 0,
			data: Buffer.from("candidate-audio-two"),
		});
		const ended = waitForEvent<any>(socket, "attempt:ended");
		await emitAck(socket, "microphone:end", {
			attemptId,
			turnId: secondCandidateTurnId,
			lastSequence: 0,
		});
		const endedPayload = await ended;
		expect(endedPayload.reason).toBe("AI_COMPLETED");
		socket.close();

		const finalSnapshot = await request(app.getHttpServer())
			.get(`/api/interview-attempts/${attemptId}`)
			.set("Cookie", candidateCookie)
			.expect(200);
		expect(finalSnapshot.body.data.state).toBe("COMPLETED");
		expect(finalSnapshot.body.data.media).toEqual({
			cameraActive: false,
			screenActive: false,
			microphoneActive: false,
		});
		expect(finalSnapshot.body.data.turns.map((turn: any) => turn.role)).toEqual(
			["assistant", "candidate", "assistant", "candidate", "assistant"],
		);
		expect(fakeLlm.turnCalls).toBe(3);
		await request(app.getHttpServer())
			.delete(`/api/interviews/${ownerInterviewId}`)
			.set("Cookie", ownerCookie)
			.expect(409);

		const ownerAttempts = await request(app.getHttpServer())
			.get(`/api/interviews/${ownerInterviewId}/attempts`)
			.set("Cookie", ownerCookie)
			.expect(200);
		expect(ownerAttempts.body.data).toEqual([
			expect.objectContaining({
				id: attemptId,
				state: "COMPLETED",
				candidate: expect.objectContaining({
					email: "candidate-ada@example.com",
				}),
				completedQuestionCount: 2,
				totalQuestionCount: 2,
			}),
		]);
		expect(ownerAttempts.body.data[0]).not.toHaveProperty("turns");
		await request(app.getHttpServer())
			.get(`/api/interviews/${ownerInterviewId}/attempts`)
			.set("Cookie", candidateCookie)
			.expect(404);

		const initialHistory = await request(app.getHttpServer())
			.get("/api/interview-attempts")
			.set("Cookie", candidateCookie)
			.expect(200);
		expect(initialHistory.body.data).toEqual([
			expect.objectContaining({
				interview: expect.objectContaining({
					id: ownerInterviewId,
					allowMultipleAttempts: true,
				}),
				attempts: [
					expect.objectContaining({ id: attemptId, state: "COMPLETED" }),
				],
			}),
		]);

		const repeated = await request(app.getHttpServer())
			.post(`/api/shared-interviews/${ownerInterviewId}/attempts`)
			.set("Cookie", candidateCookie)
			.expect(201);
		expect(repeated.body.data.id).not.toBe(attemptId);
		expect(repeated.body.data.state).toBe("READY");

		const repeatedHistory = await request(app.getHttpServer())
			.get("/api/interview-attempts")
			.set("Cookie", candidateCookie)
			.expect(200);
		expect(repeatedHistory.body.data[0].attempts).toHaveLength(2);

		const ownerCandidateHistory = await request(app.getHttpServer())
			.get("/api/interview-attempts")
			.set("Cookie", ownerCookie)
			.expect(200);
		expect(ownerCandidateHistory.body.data).toEqual([]);

		const singleInterview = await request(app.getHttpServer())
			.post("/api/interviews")
			.set("Cookie", ownerCookie)
			.send({
				title: "Single attempt interview",
				rawQuestions: "Ask one focused project question.",
				durationMinutes: 15,
			})
			.expect(201);
		expect(singleInterview.body.data.allowMultipleAttempts).toBe(false);
		await request(app.getHttpServer())
			.patch(`/api/interviews/${singleInterview.body.data.id}`)
			.set("Cookie", ownerCookie)
			.send({ isPublic: true })
			.expect(200);
		const singleAttempt = await request(app.getHttpServer())
			.post(`/api/shared-interviews/${singleInterview.body.data.id}/attempts`)
			.set("Cookie", candidateCookie)
			.expect(201);
		await app
			.get<AppDatabase>(DATABASE)
			.update(interviewAttempt)
			.set({
				state: "COMPLETED",
				startedAt: new Date(),
				endedAt: new Date(),
				endReason: "AI_COMPLETED",
			})
			.where(eq(interviewAttempt.id, singleAttempt.body.data.id));
		await request(app.getHttpServer())
			.post(`/api/shared-interviews/${singleInterview.body.data.id}/attempts`)
			.set("Cookie", candidateCookie)
			.expect(409);

		const groupedHistory = await request(app.getHttpServer())
			.get("/api/interview-attempts")
			.set("Cookie", candidateCookie)
			.expect(200);
		expect(groupedHistory.body.data).toHaveLength(2);
		expect(
			groupedHistory.body.data.find(
				(history: any) => history.interview.id === ownerInterviewId,
			).attempts,
		).toHaveLength(2);
		expect(
			groupedHistory.body.data.find(
				(history: any) => history.interview.id === singleInterview.body.data.id,
			).attempts,
		).toHaveLength(1);

		const otherCandidateSignup = await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.send({
				name: "Candidate Grace",
				email: "candidate-grace@example.com",
				password: "candidate-password-123",
			})
			.expect(200);
		const otherCandidateCookie = responseCookie(otherCandidateSignup);
		const otherAttempt = await request(app.getHttpServer())
			.post(`/api/shared-interviews/${ownerInterviewId}/attempts`)
			.set("Cookie", otherCandidateCookie)
			.expect(201);
		const otherHistory = await request(app.getHttpServer())
			.get("/api/interview-attempts")
			.set("Cookie", otherCandidateCookie)
			.expect(200);
		expect(otherHistory.body.data).toHaveLength(1);
		expect(otherHistory.body.data[0].attempts).toEqual([
			expect.objectContaining({ id: otherAttempt.body.data.id }),
		]);
		expect(
			groupedHistory.body.data.flatMap((history: any) =>
				history.attempts.map((attempt: any) => attempt.id),
			),
		).not.toContain(otherAttempt.body.data.id);
	});
});
