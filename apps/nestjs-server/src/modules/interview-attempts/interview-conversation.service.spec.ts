import { jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { User } from "better-auth/types";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AppDatabase } from "#/db/database.provider.js";
import { TIME_LIMIT_CLOSING_TEXT } from "./interview-attempt.constants.js";
import { InterviewConversationService } from "./interview-conversation.service.js";

const candidate: User = {
	id: "4b8757d8-b56b-47eb-827f-65b14977fa25",
	name: "Ada Candidate",
	email: "ada@example.com",
	emailVerified: false,
	image: null,
	createdAt: new Date("2026-08-01T00:00:00.000Z"),
	updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

const attemptId = "f0c765b0-a9fe-4a67-bf75-a63486949831";
const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";
const futureQuestionId = "83e0c06d-cbbf-47db-80fe-9da1bc4d37b0";
const clientTurnId = "19ad8c03-9e89-4d23-b393-d3cd6a654900";
const savedAssistantTurnId = "8f5a5033-020b-4187-88d7-2d7a07e53917";

type QueryChain<T> = PromiseLike<T> & {
	from: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	innerJoin: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	where: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	limit: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	orderBy: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	for: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	values: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	set: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	returning: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
};

/** Creates an awaitable Drizzle query-chain double and keeps each call inspectable. */
function query<T>(result: T): QueryChain<T> {
	const chain = {} as QueryChain<T>;
	chain.from = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.innerJoin = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.where = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.limit = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.orderBy = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.for = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.values = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.set = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.returning = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	// biome-ignore lint/suspicious/noThenProperty: Drizzle query doubles must support `await` at any fluent stage.
	chain.then = (onfulfilled, onrejected) =>
		Promise.resolve(result).then(onfulfilled, onrejected);
	return chain;
}

type MockDatabase = {
	select: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	insert: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	update: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	transaction: jest.Mock<
		(
			callback: (transaction: MockDatabase) => Promise<unknown>,
		) => Promise<unknown>
	>;
};

/** Builds the conversation service from ordered database query results. */
function createService(input: {
	select?: QueryChain<unknown>[];
	insert?: QueryChain<unknown>[];
	update?: QueryChain<unknown>[];
}) {
	const queues = {
		select: [...(input.select ?? [])],
		insert: [...(input.insert ?? [])],
		update: [...(input.update ?? [])],
	};
	const take = (kind: keyof typeof queues) => {
		const next = queues[kind].shift();
		if (!next) throw new Error(`Unexpected database.${kind}() call`);
		return next;
	};
	const database = {} as MockDatabase;
	database.select = jest.fn<(...args: unknown[]) => QueryChain<unknown>>(() =>
		take("select"),
	);
	database.insert = jest.fn<(...args: unknown[]) => QueryChain<unknown>>(() =>
		take("insert"),
	);
	database.update = jest.fn<(...args: unknown[]) => QueryChain<unknown>>(() =>
		take("update"),
	);
	database.transaction = jest.fn<
		(
			callback: (transaction: MockDatabase) => Promise<unknown>,
		) => Promise<unknown>
	>((callback) => callback(database));
	return {
		database,
		service: new InterviewConversationService(
			database as unknown as AppDatabase,
		),
	};
}

/** Returns the SQL and bound values passed to one mocked `.where(...)`. */
function compiledWhere(chain: QueryChain<unknown>) {
	const condition = chain.where.mock.calls[0]?.[0] as SQL | undefined;
	if (!condition) throw new Error("Expected a Drizzle where condition");
	return new PgDialect().sqlToQuery(condition);
}

describe("InterviewConversationService", () => {
	afterEach(() => jest.useRealTimers());

	it("persists candidate text with its observed audio window and advances state", async () => {
		const startedAt = new Date("2026-08-01T00:01:00.000Z");
		const endedAt = new Date("2026-08-01T00:01:12.000Z");
		const savedTurn = query([
			{ id: clientTurnId, text: "I synchronize server state carefully." },
		]);
		const attemptUpdate = query([]);
		const { service } = createService({
			select: [
				query([{ state: "PROCESSING" }]),
				query([]),
				query([{ sequence: 2 }]),
			],
			insert: [savedTurn],
			update: [attemptUpdate],
		});

		await expect(
			service.saveCandidateTranscript(
				attemptId,
				clientTurnId,
				"I synchronize server state carefully.",
				candidate,
				{ startedAt, endedAt },
			),
		).resolves.toEqual({
			id: clientTurnId,
			text: "I synchronize server state carefully.",
		});
		expect(savedTurn.values).toHaveBeenCalledWith({
			attemptId,
			sequence: 3,
			role: "candidate",
			text: "I synchronize server state carefully.",
			clientTurnId,
			startedAt,
			endedAt,
		});
		expect(attemptUpdate.set).toHaveBeenCalledWith(
			expect.objectContaining({ state: "ASSISTANT_SPEAKING" }),
		);
	});

	it("returns an existing candidate turn idempotently without changing its timing", async () => {
		const existing = {
			id: clientTurnId,
			text: "Previously persisted answer.",
		};
		const { database, service } = createService({
			select: [query([{ state: "PROCESSING" }]), query([existing])],
		});

		await expect(
			service.saveCandidateTranscript(
				attemptId,
				clientTurnId,
				"Retried answer.",
				candidate,
				{
					startedAt: new Date("2026-08-01T00:02:00.000Z"),
					endedAt: new Date("2026-08-01T00:02:10.000Z"),
				},
			),
		).resolves.toEqual(existing);
		expect(database.insert).not.toHaveBeenCalled();
		expect(database.update).not.toHaveBeenCalled();
	});

	it("rejects candidate text when the owned attempt is missing or not processing", async () => {
		const missing = createService({ select: [query([])] });
		const listening = createService({
			select: [query([{ state: "LISTENING" }]), query([])],
		});
		const timing = {
			startedAt: new Date("2026-08-01T00:02:00.000Z"),
			endedAt: new Date("2026-08-01T00:02:10.000Z"),
		};

		await expect(
			missing.service.saveCandidateTranscript(
				attemptId,
				clientTurnId,
				"Answer",
				candidate,
				timing,
			),
		).rejects.toThrow(NotFoundException);
		await expect(
			listening.service.saveCandidateTranscript(
				attemptId,
				clientTurnId,
				"Answer",
				candidate,
				timing,
			),
		).rejects.toThrow(ConflictException);
	});

	it("loads ordered topic progress and lowercase transcript roles into model context", async () => {
		const deadlineAt = new Date(Date.now() + 30_000);
		const { service } = createService({
			select: [
				query([
					{
						state: "ASSISTANT_SPEAKING",
						deadlineAt,
						interviewTitle: "Frontend interview",
						interviewDescription: null,
						candidateName: candidate.name,
					},
				]),
				query([
					{
						id: questionId,
						position: 1,
						title: "Effects",
						prompt: "React effect behavior",
						objective: "Explore effect reasoning",
						followUpGuidance: null,
						progress: "PENDING",
						turnCount: 1,
					},
				]),
				query([
					{ role: "assistant", text: "How do effects fit your work?" },
					{ role: "candidate", text: "I use them for synchronization." },
				]),
			],
		});

		const context = await service.loadModelContext(attemptId, candidate);

		expect(context.tasks).toEqual([
			expect.objectContaining({
				id: questionId,
				completed: false,
				turnCount: 1,
			}),
		]);
		expect(context.transcript).toEqual([
			{ role: "assistant", text: "How do effects fit your work?" },
			{ role: "candidate", text: "I use them for synchronization." },
		]);
		expect(context.candidate.name).toBe(candidate.name);
		expect(context.candidate.variationKey).toMatch(/^[a-f0-9]{32}$/);
		expect(context.candidate.variationKey).not.toContain(attemptId);
		expect(context.candidate.variationKey).not.toContain(candidate.id);
		expect(context.mustEnd).toBe(false);
	});

	it("rejects model context outside the assistant-owned states", async () => {
		const { service } = createService({ select: [query([])] });

		await expect(
			service.loadModelContext(attemptId, candidate),
		).rejects.toThrow(ConflictException);
	});

	it("atomically completes the current topic and attributes the turn to the next", async () => {
		jest.useFakeTimers();
		const startedAt = new Date("2026-08-01T00:03:00.000Z");
		jest.setSystemTime(startedAt);
		const completion = query([{ questionId }]);
		const engagement = query([{ questionId: futureQuestionId }]);
		const attemptUpdate = query([]);
		const savedTurn = query([
			{ id: savedAssistantTurnId, text: "Let us discuss debugging." },
		]);
		const { service } = createService({
			select: [
				query([
					{
						state: "ASSISTANT_SPEAKING",
						deadlineAt: new Date("2026-08-01T00:30:00.000Z"),
					},
				]),
				query([{ count: 1 }]),
				query([{ sequence: 2 }]),
			],
			update: [completion, engagement, attemptUpdate],
			insert: [savedTurn],
		});

		await expect(
			service.saveAssistantTurn(attemptId, candidate, {
				text: "Let us discuss debugging.",
				completedQuestionIds: [questionId],
				engagedQuestionId: futureQuestionId,
				endRequested: false,
				forceEnd: false,
			}),
		).resolves.toEqual({
			id: savedAssistantTurnId,
			text: "Let us discuss debugging.",
			shouldEnd: false,
			endReason: null,
		});

		expect(completion.returning).toHaveBeenCalledTimes(1);
		expect(engagement.set).toHaveBeenCalledWith({
			turnCount: expect.anything(),
		});
		expect(compiledWhere(engagement).params).toEqual(
			expect.arrayContaining([attemptId, futureQuestionId, "PENDING"]),
		);
		expect(savedTurn.values).toHaveBeenCalledWith({
			attemptId,
			sequence: 3,
			role: "assistant",
			text: "Let us discuss debugging.",
			startedAt,
		});
	});

	it("discards a generated question when the deadline expires before persistence", async () => {
		jest.useFakeTimers();
		const startedAt = new Date("2026-08-01T00:30:01.000Z");
		jest.setSystemTime(startedAt);
		const attemptUpdate = query([]);
		const savedTurn = query([
			{ id: savedAssistantTurnId, text: TIME_LIMIT_CLOSING_TEXT },
		]);
		const { database, service } = createService({
			select: [
				query([
					{
						state: "ASSISTANT_SPEAKING",
						deadlineAt: new Date("2026-08-01T00:30:00.000Z"),
					},
				]),
				query([{ sequence: 2 }]),
			],
			update: [attemptUpdate],
			insert: [savedTurn],
		});

		await expect(
			service.saveAssistantTurn(attemptId, candidate, {
				text: "Can you tell me about the next topic?",
				completedQuestionIds: [questionId],
				engagedQuestionId: futureQuestionId,
				endRequested: false,
				forceEnd: false,
			}),
		).resolves.toEqual({
			id: savedAssistantTurnId,
			text: TIME_LIMIT_CLOSING_TEXT,
			shouldEnd: true,
			endReason: "TIME_LIMIT",
		});

		expect(database.update).toHaveBeenCalledTimes(1);
		expect(savedTurn.values).toHaveBeenCalledWith({
			attemptId,
			sequence: 3,
			role: "assistant",
			text: TIME_LIMIT_CLOSING_TEXT,
			startedAt,
		});
		expect(attemptUpdate.set).toHaveBeenCalledWith(
			expect.objectContaining({ state: "ENDING", endReason: "TIME_LIMIT" }),
		);
	});

	it("ends only after an end request when every topic is complete", async () => {
		const savedTurn = query([
			{ id: savedAssistantTurnId, text: "That concludes the interview." },
		]);
		const { service } = createService({
			select: [
				query([
					{
						state: "ASSISTANT_SPEAKING",
						deadlineAt: new Date(Date.now() + 30_000),
					},
				]),
				query([{ count: 0 }]),
				query([{ sequence: 4 }]),
			],
			insert: [savedTurn],
			update: [query([])],
		});

		await expect(
			service.saveAssistantTurn(attemptId, candidate, {
				text: "That concludes the interview.",
				completedQuestionIds: [],
				engagedQuestionId: null,
				endRequested: true,
				forceEnd: false,
			}),
		).resolves.toEqual(
			expect.objectContaining({ shouldEnd: true, endReason: "AI_COMPLETED" }),
		);
	});

	it("rejects changed question progress instead of saving a stale assistant turn", async () => {
		const { database, service } = createService({
			select: [
				query([
					{
						state: "ASSISTANT_SPEAKING",
						deadlineAt: new Date(Date.now() + 30_000),
					},
				]),
			],
			update: [query([])],
		});

		await expect(
			service.saveAssistantTurn(attemptId, candidate, {
				text: "Next question",
				completedQuestionIds: [questionId],
				engagedQuestionId: null,
				endRequested: false,
				forceEnd: false,
			}),
		).rejects.toThrow(ConflictException);
		expect(database.insert).not.toHaveBeenCalled();
	});

	it("records the end of one assistant utterance without overwriting retries", async () => {
		jest.useFakeTimers();
		const endedAt = new Date("2026-08-01T00:04:00.000Z");
		jest.setSystemTime(endedAt);
		const update = query([]);
		const { service } = createService({ update: [update] });

		await expect(
			service.finishAssistantTurn(attemptId, savedAssistantTurnId),
		).resolves.toBeUndefined();
		expect(update.set).toHaveBeenCalledWith({ endedAt });
		const compiled = compiledWhere(update);
		expect(compiled.params).toEqual(
			expect.arrayContaining([savedAssistantTurnId, attemptId, "assistant"]),
		);
		expect(compiled.sql).toContain('"interview_turn"."ended_at" is null');
	});
});
