import { jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { User } from "better-auth/types";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AppDatabase } from "#src/db/database.provider.js";
import type { AttemptSnapshot } from "./dto/response.dto.js";
import type { InterviewAttemptStateService } from "./interview-attempt-state.service.js";
import { InterviewAttemptsService } from "./interview-attempts.service.js";

const candidate: User = {
	id: "4b8757d8-b56b-47eb-827f-65b14977fa25",
	name: "Ada Candidate",
	email: "ada@example.com",
	emailVerified: false,
	image: null,
	createdAt: new Date("2026-08-01T00:00:00.000Z"),
	updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
const attemptId = "f0c765b0-a9fe-4a67-bf75-a63486949831";
const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";

type QueryChain<T> = PromiseLike<T> & {
	from: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	innerJoin: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	leftJoin: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	where: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	limit: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	orderBy: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	groupBy: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	for: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	values: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	onConflictDoNothing: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	returning: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
};

/** Creates an awaitable Drizzle query-chain double and keeps each call inspectable. */
function query<T>(result: T): QueryChain<T> {
	const chain = {} as QueryChain<T>;
	chain.from = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.innerJoin = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.leftJoin = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.where = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.limit = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.orderBy = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.groupBy = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.for = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.values = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.onConflictDoNothing = jest.fn<(...args: unknown[]) => QueryChain<T>>(
		() => chain,
	);
	chain.returning = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	// biome-ignore lint/suspicious/noThenProperty: Drizzle query doubles must support `await` at any fluent stage.
	chain.then = (onfulfilled, onrejected) =>
		Promise.resolve(result).then(onfulfilled, onrejected);
	return chain;
}

type MockDatabase = {
	select: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	insert: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	transaction: jest.Mock<
		(
			callback: (transaction: MockDatabase) => Promise<unknown>,
		) => Promise<unknown>
	>;
};

/** Builds the attempt service with ordered database results and a state double. */
function createService(input: {
	select?: QueryChain<unknown>[];
	insert?: QueryChain<unknown>[];
}) {
	const queues = {
		select: [...(input.select ?? [])],
		insert: [...(input.insert ?? [])],
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
	database.transaction = jest.fn<
		(
			callback: (transaction: MockDatabase) => Promise<unknown>,
		) => Promise<unknown>
	>((callback) => callback(database));
	const state = {
		findSnapshot: jest.fn<(...args: unknown[]) => Promise<AttemptSnapshot>>(),
	};
	return {
		database,
		state,
		service: new InterviewAttemptsService(
			database as unknown as AppDatabase,
			state as unknown as InterviewAttemptStateService,
		),
	};
}

/** Returns the SQL and bound values passed to one mocked `.where(...)`. */
function compiledWhere(chain: QueryChain<unknown>) {
	const condition = chain.where.mock.calls[0]?.[0] as SQL | undefined;
	if (!condition) throw new Error("Expected a Drizzle where condition");
	return new PgDialect().sqlToQuery(condition);
}

function snapshot(state: AttemptSnapshot["state"]): AttemptSnapshot {
	return {
		id: attemptId,
		state,
		startedAt: "2026-08-01T00:00:00.000Z",
		deadlineAt: "2026-08-01T00:30:00.000Z",
		endedAt: null,
		endReason: null,
		media: {
			cameraActive: false,
			screenActive: false,
			microphoneActive: false,
		},
		turns: [],
	};
}

describe("InterviewAttemptsService", () => {
	it("creates one attempt, initializes every question, and returns the state snapshot", async () => {
		const definitionQuery = query([
			{ id: interviewId, allowMultipleAttempts: false },
		]);
		const noExistingQuery = query([]);
		const createdQuery = query([{ id: attemptId }]);
		const questionsQuery = query([{ id: questionId }]);
		const progressQuery = query([]);
		const { database, state, service } = createService({
			select: [definitionQuery, noExistingQuery, questionsQuery],
			insert: [createdQuery, progressQuery],
		});
		const expected = snapshot("READY");
		state.findSnapshot.mockResolvedValue(expected);

		await expect(service.createOrResume(interviewId, candidate)).resolves.toBe(
			expected,
		);

		const definitionWhere = compiledWhere(definitionQuery);
		expect(definitionWhere.sql).toContain('"interview"."id" =');
		expect(definitionWhere.sql).toContain('"interview"."is_public" =');
		expect(definitionWhere.params).toEqual([interviewId, true]);
		expect(createdQuery.values).toHaveBeenCalledWith({
			interviewId,
			candidateId: candidate.id,
		});
		expect(createdQuery.onConflictDoNothing).toHaveBeenCalledWith();
		expect(progressQuery.values).toHaveBeenCalledWith([
			{ attemptId, questionId },
		]);
		expect(state.findSnapshot).toHaveBeenCalledWith(attemptId, candidate);
		expect(database.transaction).toHaveBeenCalledTimes(1);
	});

	it("hides a private interview as missing", async () => {
		const { database, service } = createService({ select: [query([])] });

		await expect(
			service.createOrResume(interviewId, candidate),
		).rejects.toThrow(NotFoundException);
		expect(database.insert).not.toHaveBeenCalled();
	});

	it("resumes the same nonterminal attempt without duplicating question progress", async () => {
		const { database, state, service } = createService({
			select: [
				query([{ id: interviewId, allowMultipleAttempts: true }]),
				query([{ id: attemptId, state: "LISTENING" }]),
			],
		});
		const expected = snapshot("LISTENING");
		state.findSnapshot.mockResolvedValue(expected);

		await expect(service.createOrResume(interviewId, candidate)).resolves.toBe(
			expected,
		);

		expect(database.insert).not.toHaveBeenCalled();
		expect(state.findSnapshot).toHaveBeenCalledWith(attemptId, candidate);
	});

	it.each(["COMPLETED", "FAILED"] as const)(
		"rejects a new single-use attempt after terminal state %s",
		async (terminalState) => {
			const { service } = createService({
				select: [
					query([{ id: interviewId, allowMultipleAttempts: false }]),
					query([{ id: attemptId, state: terminalState }]),
				],
			});

			await expect(
				service.createOrResume(interviewId, candidate),
			).rejects.toThrow(ConflictException);
		},
	);

	it("creates a fresh attempt after completion when repeats are enabled", async () => {
		const nextAttemptId = "62c70e0a-41e3-41e4-8918-d6b198a2da9f";
		const createdQuery = query([{ id: nextAttemptId }]);
		const progressQuery = query([]);
		const { state, service } = createService({
			select: [
				query([{ id: interviewId, allowMultipleAttempts: true }]),
				query([{ id: attemptId, state: "COMPLETED" }]),
				query([{ id: questionId }]),
			],
			insert: [createdQuery, progressQuery],
		});
		const expected = { ...snapshot("READY"), id: nextAttemptId };
		state.findSnapshot.mockResolvedValue(expected);

		await expect(service.createOrResume(interviewId, candidate)).resolves.toBe(
			expected,
		);
		expect(createdQuery.values).toHaveBeenCalledWith({
			interviewId,
			candidateId: candidate.id,
		});
		expect(progressQuery.values).toHaveBeenCalledWith([
			{ attemptId: nextAttemptId, questionId },
		]);
	});

	it("resumes a concurrently created active attempt after an insert race", async () => {
		const concurrentAttemptId = "62c70e0a-41e3-41e4-8918-d6b198a2da9f";
		const racedInsert = query([]);
		const { state, service } = createService({
			select: [
				query([{ id: interviewId, allowMultipleAttempts: true }]),
				query([{ id: attemptId, state: "COMPLETED" }]),
				query([{ id: concurrentAttemptId }]),
			],
			insert: [racedInsert],
		});
		const expected = { ...snapshot("READY"), id: concurrentAttemptId };
		state.findSnapshot.mockResolvedValue(expected);

		await expect(service.createOrResume(interviewId, candidate)).resolves.toBe(
			expected,
		);
		expect(racedInsert.onConflictDoNothing).toHaveBeenCalledWith();
		expect(state.findSnapshot).toHaveBeenCalledWith(
			concurrentAttemptId,
			candidate,
		);
	});

	it("returns creator-safe participant progress for an owned interview", async () => {
		const createdAt = new Date("2026-08-01T00:00:00.000Z");
		const { service } = createService({
			select: [
				query([{ id: interviewId }]),
				query([
					{
						id: attemptId,
						candidateId: candidate.id,
						candidateName: candidate.name,
						candidateEmail: candidate.email,
						state: "COMPLETED",
						endReason: "AI_COMPLETED",
						createdAt,
						startedAt: createdAt,
						deadlineAt: new Date("2026-08-01T00:30:00.000Z"),
						endedAt: new Date("2026-08-01T00:10:00.000Z"),
						completedQuestionCount: "2",
						totalQuestionCount: "2",
					},
				]),
			],
		});

		await expect(
			service.findAllForCreator(interviewId, candidate),
		).resolves.toEqual([
			expect.objectContaining({
				id: attemptId,
				candidate: {
					id: candidate.id,
					name: candidate.name,
					email: candidate.email,
				},
				completedQuestionCount: 2,
				totalQuestionCount: 2,
			}),
		]);
	});

	it("hides participant history for an interview the current user does not own", async () => {
		const { service } = createService({ select: [query([])] });

		await expect(
			service.findAllForCreator(interviewId, candidate),
		).rejects.toThrow(NotFoundException);
	});

	it("groups every candidate attempt under its interview", async () => {
		const secondAttemptId = "62c70e0a-41e3-41e4-8918-d6b198a2da9f";
		const createdAt = new Date("2026-08-01T00:00:00.000Z");
		const base = {
			interviewId,
			interviewTitle: "Junior React Developer",
			interviewDescription: null,
			durationMinutes: 30,
			allowMultipleAttempts: true,
			state: "COMPLETED" as const,
			endReason: "AI_COMPLETED" as const,
			createdAt,
			startedAt: createdAt,
			deadlineAt: new Date("2026-08-01T00:30:00.000Z"),
			endedAt: new Date("2026-08-01T00:10:00.000Z"),
			completedQuestionCount: 2,
			totalQuestionCount: 2,
		};
		const { service } = createService({
			select: [
				query([
					{ ...base, attemptId: secondAttemptId },
					{ ...base, attemptId },
				]),
			],
		});

		const histories = await service.findAllForCandidate(candidate);

		expect(histories).toHaveLength(1);
		expect(histories[0]?.interview).toEqual({
			id: interviewId,
			title: "Junior React Developer",
			description: null,
			durationMinutes: 30,
			allowMultipleAttempts: true,
		});
		expect(histories[0]?.attempts.map((attempt) => attempt.id)).toEqual([
			secondAttemptId,
			attemptId,
		]);
	});

	it("delegates candidate snapshot reads to the state service", async () => {
		const { state, service } = createService({});
		const expected = snapshot("LISTENING");
		state.findSnapshot.mockResolvedValue(expected);

		await expect(service.findSnapshot(attemptId, candidate)).resolves.toBe(
			expected,
		);
		expect(state.findSnapshot).toHaveBeenCalledWith(attemptId, candidate);
	});
});
