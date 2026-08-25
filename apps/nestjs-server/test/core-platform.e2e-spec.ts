import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { AppModule } from "#/app.module.js";
import { type AppDatabase, DATABASE } from "#/db/database.provider.js";
import { interview, user } from "#/db/schema/index.js";
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
import { DEFAULT_DEV_FLAGS } from "#/modules/dev-flags/dev-flags.schema.js";
import { DevFlagsService } from "#/modules/dev-flags/dev-flags.service.js";
import { OpenApiService } from "#/modules/open-api/open-api.service.js";
import type { AppConfigService } from "#/types/index.js";

const runId = randomUUID();
const password = "core-platform-password-123";

type AuthFixture = {
	cookie: string;
	email: string;
	id: string;
};

class FakeInterviewLlm implements InterviewLlmPort {
	structureCalls: Array<Parameters<InterviewLlmPort["structureQuestions"]>[0]> =
		[];

	reset(): void {
		this.structureCalls = [];
	}

	async structureQuestions(
		input: Parameters<InterviewLlmPort["structureQuestions"]>[0],
	) {
		this.structureCalls.push(input);
		if (input.rawQuestions.includes("[FAIL]")) {
			throw new Error("simulated LLM failure");
		}
		return [
			{
				title: "React state",
				prompt: "Explain how React state updates work.",
				objective: "Assess state-management fundamentals.",
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

	async generateTurn(): Promise<never> {
		throw new Error("Interview turns are outside this suite's scope");
	}
}

const fakeSpeechToText: SpeechToTextPort = {
	async transcribe() {
		return "unused transcript";
	},
};

const fakeTextToSpeech: TextToSpeechPort = {
	async synthesize() {
		return {
			bytes: Buffer.from("unused audio"),
			mimeType: "audio/l16",
			sampleRateHz: 24_000,
			channels: 1,
		};
	},
};

function responseCookie(response: request.Response): string {
	const header = response.headers["set-cookie"];
	const raw = Array.isArray(header) ? header[0] : header;
	if (!raw) throw new Error("Authentication response did not set a cookie");
	return raw.split(";")[0] ?? raw;
}

describe("core platform end to end", () => {
	let app: INestApplication;
	let database: AppDatabase;
	let flags: DevFlagsService;
	let fakeLlm: FakeInterviewLlm;
	let owner: AuthFixture;
	let foreignUser: AuthFixture;
	const createdUserIds = new Set<string>();

	function server() {
		return app.getHttpServer();
	}

	async function signUp(label: string): Promise<AuthFixture> {
		const email = `core-${label}-${runId}@example.com`;
		const response = await request(server())
			.post("/api/auth/sign-up/email")
			.send({ name: `Core ${label}`, email, password })
			.expect(200);
		const id = response.body.user?.id;
		if (typeof id !== "string") {
			throw new Error("Authentication response did not include a user ID");
		}
		createdUserIds.add(id);
		return { cookie: responseCookie(response), email, id };
	}

	async function createInterview(
		overrides: Record<string, unknown> = {},
	): Promise<request.Response> {
		return request(server())
			.post("/api/interviews")
			.set("Cookie", owner.cookie)
			.send({
				title: "Core platform interview",
				description: "A deterministic server e2e fixture.",
				rawQuestions: "Ask about React state and a difficult bug.",
				durationMinutes: 30,
				...overrides,
			})
			.expect(201);
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
		await app.get(OpenApiService).setup(app);
		await app.init();

		database = app.get<AppDatabase>(DATABASE);
		flags = app.get(DevFlagsService);
		owner = await signUp("owner");
		foreignUser = await signUp("foreign");
	});

	beforeEach(async () => {
		fakeLlm.reset();
		flags.update(DEFAULT_DEV_FLAGS);
		await database.delete(interview).where(eq(interview.createdById, owner.id));
	});

	afterAll(async () => {
		try {
			if (database && createdUserIds.size > 0) {
				await database
					.delete(user)
					.where(inArray(user.id, [...createdUserIds]));
			}
		} finally {
			if (app) await app.close();
		}
	});

	it("reports public liveness and database readiness", async () => {
		await request(server())
			.get("/api")
			.expect(200, {
				message: "Retrieved successfully",
				data: { service: "interview-api", status: "ok" },
			});
		await request(server())
			.get("/api/ready")
			.expect(200, {
				message: "Retrieved successfully",
				data: {
					service: "interview-api",
					status: "ok",
					dependencies: { database: "ok" },
				},
			});
	});

	it("supports the complete allowed email/password session lifecycle", async () => {
		await request(server()).get("/api/interviews").expect(401);

		const lifecycleUser = await signUp("auth-lifecycle");
		await request(server())
			.get("/api/auth/get-session")
			.set("Cookie", lifecycleUser.cookie)
			.expect(200)
			.expect(({ body }) => {
				expect(body.user).toMatchObject({
					id: lifecycleUser.id,
					email: lifecycleUser.email,
				});
			});

		await request(server())
			.post("/api/auth/sign-out")
			.set("Cookie", lifecycleUser.cookie)
			.expect(200);
		await request(server())
			.get("/api/auth/get-session")
			.set("Cookie", lifecycleUser.cookie)
			.expect(200)
			.expect(({ body }) => expect(body).toBeNull());

		const login = await request(server())
			.post("/api/auth/sign-in/email")
			.send({ email: lifecycleUser.email, password })
			.expect(200);
		await request(server())
			.get("/api/auth/get-session")
			.set("Cookie", responseCookie(login))
			.expect(200)
			.expect(({ body }) => expect(body.user.email).toBe(lifecycleUser.email));

		await request(server())
			.post("/api/auth/sign-in/social")
			.send({ provider: "github" })
			.expect(404);
	});

	it("reads and partially updates authenticated development flags", async () => {
		await request(server())
			.get("/api/__flags__")
			.set("Cookie", owner.cookie)
			.expect(200, {
				message: "Retrieved successfully",
				data: DEFAULT_DEV_FLAGS,
			});

		await request(server())
			.patch("/api/__flags__")
			.set("Cookie", owner.cookie)
			.send({ streamCameraToServer: true })
			.expect(200, {
				message: "Updated successfully",
				data: { ...DEFAULT_DEV_FLAGS, streamCameraToServer: true },
			});

		await request(server())
			.get("/api/__flags__")
			.set("Cookie", foreignUser.cookie)
			.expect(200)
			.expect(({ body }) => {
				expect(body.data).toEqual({
					...DEFAULT_DEV_FLAGS,
					streamCameraToServer: true,
				});
			});
	});

	it("rejects invalid development flag changes without mutating state", async () => {
		for (const payload of [
			{},
			{ streamCameraToServer: "yes" },
			{ extra: true },
		]) {
			await request(server())
				.patch("/api/__flags__")
				.set("Cookie", owner.cookie)
				.send(payload)
				.expect(422)
				.expect(({ body }) => {
					expect(body.message).toBe("Input validation failed");
					expect(body.error).toEqual(expect.any(Array));
				});
		}
		expect(flags.get()).toEqual(DEFAULT_DEV_FLAGS);
	});

	it("publishes application and narrow auth OpenAPI contracts", async () => {
		const applicationSchema = await request(server())
			.get("/api-docs.json")
			.expect(200);
		expect(applicationSchema.body.info).toMatchObject({
			title: "Interview Desk Test API",
			version: "0.1.0",
		});
		expect(
			applicationSchema.body.components.securitySchemes.betterAuthSession,
		).toMatchObject({ type: "apiKey", in: "cookie" });
		expect(
			applicationSchema.body.paths["/api/interviews"].post.security,
		).toEqual([{ betterAuthSession: [] }]);
		expect(
			applicationSchema.body.paths["/api/interviews/public/{id}"].get.security,
		).toEqual([]);

		const authSchema = await request(server())
			.get("/auth-docs.json")
			.expect(200);
		expect(Object.keys(authSchema.body.paths).sort()).toEqual([
			"/get-session",
			"/sign-in/email",
			"/sign-out",
			"/sign-up/email",
		]);
		await request(server())
			.get("/api/auth/open-api/generate-schema")
			.expect(404);
	});

	it("supports owner CRUD while hiding interviews from other users", async () => {
		const created = await createInterview({ allowMultipleAttempts: true });
		const interviewId = created.body.data.id;
		expect(created.body).toMatchObject({
			message: "Created successfully",
			data: {
				id: interviewId,
				title: "Core platform interview",
				description: "A deterministic server e2e fixture.",
				rawQuestions: "Ask about React state and a difficult bug.",
				durationMinutes: 30,
				allowMultipleAttempts: true,
				isPublic: false,
				questionCount: 2,
			},
		});
		expect(created.body.data.questions).toEqual([
			expect.objectContaining({ position: 1, title: "React state" }),
			expect.objectContaining({ position: 2, title: "Difficult bug" }),
		]);
		expect(fakeLlm.structureCalls).toEqual([
			expect.objectContaining({
				interviewTitle: "Core platform interview",
				interviewDescription: "A deterministic server e2e fixture.",
				rawQuestions: "Ask about React state and a difficult bug.",
			}),
		]);

		const ownerList = await request(server())
			.get("/api/interviews")
			.set("Cookie", owner.cookie)
			.expect(200);
		expect(ownerList.body.data).toEqual([
			expect.objectContaining({ id: interviewId, questionCount: 2 }),
		]);
		expect(ownerList.body.data[0]).not.toHaveProperty("rawQuestions");
		expect(ownerList.body.data[0]).not.toHaveProperty("questions");
		await request(server())
			.get("/api/interviews")
			.set("Cookie", foreignUser.cookie)
			.expect(200, { message: "Retrieved successfully", data: [] });

		const details = await request(server())
			.get(`/api/interviews/${interviewId}`)
			.set("Cookie", owner.cookie)
			.expect(200);
		expect(
			details.body.data.questions.map((question: any) => question.id),
		).toEqual(created.body.data.questions.map((question: any) => question.id));

		await request(server())
			.get(`/api/interviews/${interviewId}`)
			.set("Cookie", foreignUser.cookie)
			.expect(404);
		await request(server())
			.patch(`/api/interviews/${interviewId}`)
			.set("Cookie", foreignUser.cookie)
			.send({ title: "Foreign update" })
			.expect(404);
		await request(server())
			.delete(`/api/interviews/${interviewId}`)
			.set("Cookie", foreignUser.cookie)
			.expect(404);

		const updated = await request(server())
			.patch(`/api/interviews/${interviewId}`)
			.set("Cookie", owner.cookie)
			.send({ title: "Updated core interview", description: null })
			.expect(200);
		expect(updated.body.data).toMatchObject({
			id: interviewId,
			title: "Updated core interview",
			description: null,
			rawQuestions: "Ask about React state and a difficult bug.",
		});
		expect(
			updated.body.data.questions.map((question: any) => question.id),
		).toEqual(created.body.data.questions.map((question: any) => question.id));

		await request(server())
			.delete(`/api/interviews/${interviewId}`)
			.set("Cookie", owner.cookie)
			.expect(200, {
				message: "Deleted successfully",
				data: { id: interviewId },
			});
		await request(server())
			.get(`/api/interviews/${interviewId}`)
			.set("Cookie", owner.cookie)
			.expect(404);
	});

	it("keeps private interviews hidden and exposes a safe public preview", async () => {
		const created = await createInterview({ allowMultipleAttempts: true });
		const interviewId = created.body.data.id;
		await request(server())
			.get(`/api/interviews/public/${interviewId}`)
			.expect(404);

		await request(server())
			.patch(`/api/interviews/${interviewId}`)
			.set("Cookie", owner.cookie)
			.send({ isPublic: true })
			.expect(200);
		const preview = await request(server())
			.get(`/api/interviews/public/${interviewId}`)
			.expect(200);
		expect(preview.body).toEqual({
			message: "Retrieved successfully",
			data: {
				title: "Core platform interview",
				description: "A deterministic server e2e fixture.",
				durationMinutes: 30,
				allowMultipleAttempts: true,
				questionCount: 2,
			},
		});

		await request(server())
			.patch(`/api/interviews/${interviewId}`)
			.set("Cookie", owner.cookie)
			.send({ isPublic: false })
			.expect(200);
		await request(server())
			.get(`/api/interviews/public/${interviewId}`)
			.expect(404);
	});

	it("strictly validates interview requests before calling the LLM", async () => {
		await request(server())
			.post("/api/interviews")
			.set("Cookie", owner.cookie)
			.send({
				title: "Invalid interview",
				rawQuestions: "Ask one question.",
				durationMinutes: 30,
				unknownField: true,
			})
			.expect(422);
		await request(server())
			.patch("/api/interviews/not-a-uuid")
			.set("Cookie", owner.cookie)
			.send({ title: "Valid title" })
			.expect(422);
		await request(server())
			.patch(`/api/interviews/${randomUUID()}`)
			.set("Cookie", owner.cookie)
			.send({})
			.expect(422);
		await request(server())
			.patch(`/api/interviews/${randomUUID()}`)
			.set("Cookie", owner.cookie)
			.send({ rawQuestions: "Questions cannot be replaced." })
			.expect(422);
		expect(fakeLlm.structureCalls).toHaveLength(0);
	});

	it("sanitizes an LLM failure and does not persist an interview", async () => {
		await request(server())
			.post("/api/interviews")
			.set("Cookie", owner.cookie)
			.send({
				title: "Provider failure interview",
				rawQuestions: "[FAIL] provider request",
				durationMinutes: 30,
			})
			.expect(503, {
				message: "Whoops! Something went wrong on the server",
				error: null,
			});
		expect(fakeLlm.structureCalls).toHaveLength(1);
		await request(server())
			.get("/api/interviews")
			.set("Cookie", owner.cookie)
			.expect(200, { message: "Retrieved successfully", data: [] });
	});
});
