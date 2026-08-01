import { jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { User } from "better-auth/types";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AppDatabase } from "../../db/database.provider.js";
import type { AttemptSnapshot } from "./dto/response.dto.js";
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
const clientTurnId = "19ad8c03-9e89-4d23-b393-d3cd6a654900";

type QueryChain<T> = PromiseLike<T> & {
	from: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	innerJoin: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	where: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	limit: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	orderBy: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	for: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	values: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	set: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	onConflictDoNothing: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
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
	update: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	transaction: jest.Mock<
		(
			callback: (transaction: MockDatabase) => Promise<unknown>,
		) => Promise<unknown>
	>;
};

/** Builds a transaction-capable database double from ordered query results. */
function databaseMock(input: {
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
		service: new InterviewAttemptsService(database as unknown as AppDatabase),
	};
}

/** Returns the SQL and bound values passed to one mocked `.where(...)`. */
function compiledWhere(chain: QueryChain<unknown>) {
	const condition = chain.where.mock.calls[0]?.[0] as SQL | undefined;
	if (!condition) throw new Error("Expected a Drizzle where condition");
	return new PgDialect().sqlToQuery(condition);
}

function attemptRow(state: AttemptSnapshot["state"]) {
	return {
		id: attemptId,
		interviewId,
		candidateId: candidate.id,
		state,
		startedAt: new Date("2026-08-01T00:00:00.000Z"),
		deadlineAt: new Date("2026-08-01T00:30:00.000Z"),
		endedAt:
			state === "COMPLETED" || state === "FAILED"
				? new Date("2026-08-01T00:10:00.000Z")
				: null,
		endReason: state === "COMPLETED" ? ("AI_COMPLETED" as const) : null,
		version: 2,
		cameraActive: false,
		screenActive: false,
		microphoneActive: false,
		createdAt: new Date("2026-08-01T00:00:00.000Z"),
		updatedAt: new Date("2026-08-01T00:01:00.000Z"),
	};
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
	it("creates one attempt, initializes every question, and returns its snapshot", async () => {
		const definitionQuery = query([{ id: interviewId }]);
		const createdQuery = query([{ id: attemptId }]);
		const questionsQuery = query([{ id: questionId }]);
		const progressQuery = query([]);
		const { database, service } = databaseMock({
			select: [definitionQuery, questionsQuery],
			insert: [createdQuery, progressQuery],
		});
		const expected = snapshot("READY");
		jest.spyOn(service, "findSnapshot").mockResolvedValue(expected);

		await expect(
			service.createOrResume("shared-code", candidate),
		).resolves.toBe(expected);

		expect(createdQuery.values).toHaveBeenCalledWith({
			interviewId,
			candidateId: candidate.id,
		});
		expect(createdQuery.onConflictDoNothing).toHaveBeenCalledTimes(1);
		expect(progressQuery.values).toHaveBeenCalledWith([
			{ attemptId, questionId },
		]);
		expect(database.transaction).toHaveBeenCalledTimes(1);
	});

	it("resumes the same nonterminal attempt without duplicating question progress", async () => {
		const definitionQuery = query([{ id: interviewId }]);
		const conflictQuery = query([]);
		const existingQuery = query([{ id: attemptId, state: "LISTENING" }]);
		const { database, service } = databaseMock({
			select: [definitionQuery, existingQuery],
			insert: [conflictQuery],
		});
		const expected = snapshot("LISTENING");
		jest.spyOn(service, "findSnapshot").mockResolvedValue(expected);

		await expect(
			service.createOrResume("shared-code", candidate),
		).resolves.toBe(expected);

		expect(database.insert).toHaveBeenCalledTimes(1);
		expect(service.findSnapshot).toHaveBeenCalledWith(attemptId, candidate);
	});

	it("rejects resuming an already completed attempt", async () => {
		const { service } = databaseMock({
			select: [
				query([{ id: interviewId }]),
				query([{ id: attemptId, state: "COMPLETED" }]),
			],
			insert: [query([])],
		});

		await expect(
			service.createOrResume("shared-code", candidate),
		).rejects.toThrow(ConflictException);
	});

	it("does not steal a fresh PROCESSING attempt during reconnect", async () => {
		const processing = query([
			{
				state: "PROCESSING",
				durationMinutes: 30,
				updatedAt: new Date(),
			},
		]);
		const { database, service } = databaseMock({ select: [processing] });
		jest
			.spyOn(service, "findSnapshot")
			.mockResolvedValue(snapshot("PROCESSING"));

		await expect(service.start(attemptId, candidate)).resolves.toEqual({
			snapshot: snapshot("PROCESSING"),
			shouldRunAssistant: false,
		});
		expect(database.update).not.toHaveBeenCalled();
	});

	it("recovers stale PROCESSING work for an assistant replay", async () => {
		const processing = query([
			{
				state: "PROCESSING",
				durationMinutes: 30,
				updatedAt: new Date(Date.now() - 3 * 60_000 - 1),
			},
		]);
		const recovery = query([]);
		const { database, service } = databaseMock({
			select: [processing],
			update: [recovery],
		});
		jest
			.spyOn(service, "findSnapshot")
			.mockResolvedValue(snapshot("ASSISTANT_SPEAKING"));

		await expect(service.start(attemptId, candidate)).resolves.toEqual({
			snapshot: snapshot("ASSISTANT_SPEAKING"),
			shouldRunAssistant: true,
		});
		expect(database.update).toHaveBeenCalledTimes(1);
		expect(recovery.set).toHaveBeenCalledWith(
			expect.objectContaining({ state: "ASSISTANT_SPEAKING" }),
		);
	});

	it("treats a replayed candidate turn ID as an idempotent duplicate", async () => {
		const { database, service } = databaseMock({
			select: [query([{ id: "persisted-turn" }])],
		});

		await expect(
			service.claimCandidateTurn(attemptId, clientTurnId, candidate),
		).resolves.toEqual({ claimed: false, duplicate: true });
		expect(database.update).not.toHaveBeenCalled();
	});

	it("loses a candidate-turn compare-and-set cleanly and enforces a future deadline", async () => {
		const claimQuery = query([]);
		const { service } = databaseMock({
			select: [query([]), query([attemptRow("PROCESSING")])],
			update: [claimQuery],
		});

		await expect(
			service.claimCandidateTurn(attemptId, clientTurnId, candidate),
		).rejects.toThrow(ConflictException);

		const compiled = compiledWhere(claimQuery);
		expect(compiled.sql).toContain('"interview_attempt"."deadline_at" >');
		expect(compiled.params).toEqual(
			expect.arrayContaining([attemptId, candidate.id, "LISTENING"]),
		);
	});

	it("claims a deadline only through the allowed active states and expired-time predicate", async () => {
		const claimQuery = query([{ id: attemptId }]);
		const { service } = databaseMock({ update: [claimQuery] });

		await expect(service.claimDeadline(attemptId, candidate)).resolves.toBe(
			true,
		);

		const compiled = compiledWhere(claimQuery);
		expect(compiled.sql).toContain('"interview_attempt"."deadline_at" <=');
		expect(compiled.params).toEqual(
			expect.arrayContaining([
				attemptId,
				candidate.id,
				"ASSISTANT_SPEAKING",
				"LISTENING",
				"PROCESSING",
			]),
		);
	});

	it("reports an unclaimed deadline without throwing", async () => {
		const { service } = databaseMock({ update: [query([])] });

		await expect(service.claimDeadline(attemptId, candidate)).resolves.toBe(
			false,
		);
	});

	it.each(["COMPLETED", "FAILED"] as const)(
		"rejects media mutation for a %s attempt",
		async (state) => {
			const mediaUpdate = query([]);
			const { service } = databaseMock({
				select: [query([attemptRow(state)])],
				update: [mediaUpdate],
			});

			await expect(
				service.updateMedia(attemptId, candidate, {
					cameraActive: true,
					screenActive: true,
					microphoneActive: true,
				}),
			).rejects.toThrow(ConflictException);

			const compiled = compiledWhere(mediaUpdate);
			expect(compiled.params).toEqual(
				expect.arrayContaining([
					attemptId,
					candidate.id,
					"COMPLETED",
					"FAILED",
				]),
			);
		},
	);

	it("hides attempt ownership when a rejected media update finds no owned row", async () => {
		const { service } = databaseMock({
			select: [query([])],
			update: [query([])],
		});

		await expect(
			service.updateMedia(attemptId, candidate, {
				cameraActive: false,
				screenActive: false,
				microphoneActive: false,
			}),
		).rejects.toThrow(NotFoundException);
	});
});
