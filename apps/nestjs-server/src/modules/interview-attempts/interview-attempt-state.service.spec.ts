import { jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { User } from "better-auth/types";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AppDatabase } from "#src/db/database.provider.js";
import type { AttemptSnapshot } from "./dto/response.dto.js";
import { InterviewAttemptStateService } from "./interview-attempt-state.service.js";

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
const clientTurnId = "19ad8c03-9e89-4d23-b393-d3cd6a654900";

type QueryChain<T> = PromiseLike<T> & {
	from: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	innerJoin: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	where: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	limit: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	orderBy: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	for: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
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
	chain.set = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.returning = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	// biome-ignore lint/suspicious/noThenProperty: Drizzle query doubles must support `await` at any fluent stage.
	chain.then = (onfulfilled, onrejected) =>
		Promise.resolve(result).then(onfulfilled, onrejected);
	return chain;
}

type MockDatabase = {
	select: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	update: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	transaction: jest.Mock<
		(
			callback: (transaction: MockDatabase) => Promise<unknown>,
		) => Promise<unknown>
	>;
};

/** Builds the lifecycle service from ordered select/update results. */
function createService(input: {
	select?: QueryChain<unknown>[];
	update?: QueryChain<unknown>[];
}) {
	const queues = {
		select: [...(input.select ?? [])],
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
		service: new InterviewAttemptStateService(
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
		endedAt: state === "COMPLETED" ? "2026-08-01T00:10:00.000Z" : null,
		endReason: state === "COMPLETED" ? "AI_COMPLETED" : null,
		media: {
			cameraActive: false,
			screenActive: false,
			microphoneActive: false,
		},
		turns: [],
	};
}

describe("InterviewAttemptStateService", () => {
	afterEach(() => jest.useRealTimers());

	it("returns an ordered reconnect snapshot with persisted conversation timing", async () => {
		const turnStartedAt = new Date("2026-08-01T00:00:01.000Z");
		const turnEndedAt = new Date("2026-08-01T00:00:03.000Z");
		const createdAt = new Date("2026-08-01T00:00:00.500Z");
		const { service } = createService({
			select: [
				query([attemptRow("LISTENING")]),
				query([
					{
						id: clientTurnId,
						sequence: 1,
						role: "candidate",
						text: "I use state for local UI data.",
						startedAt: turnStartedAt,
						endedAt: turnEndedAt,
						createdAt,
					},
				]),
			],
		});

		await expect(service.findSnapshot(attemptId, candidate)).resolves.toEqual(
			expect.objectContaining({
				id: attemptId,
				state: "LISTENING",
				turns: [
					{
						id: clientTurnId,
						sequence: 1,
						role: "candidate",
						text: "I use state for local UI data.",
						startedAt: turnStartedAt.toISOString(),
						endedAt: turnEndedAt.toISOString(),
						createdAt: createdAt.toISOString(),
					},
				],
			}),
		);
	});

	it("hides missing and foreign attempt IDs", async () => {
		const { service } = createService({ select: [query([])] });

		await expect(service.findSnapshot(attemptId, candidate)).rejects.toThrow(
			NotFoundException,
		);
	});

	it("starts a ready attempt with a server-owned deadline", async () => {
		jest.useFakeTimers();
		const startedAt = new Date("2026-08-01T00:00:00.000Z");
		jest.setSystemTime(startedAt);
		const startUpdate = query([]);
		const { service } = createService({
			select: [
				query([
					{
						state: "READY",
						durationMinutes: 30,
						updatedAt: startedAt,
					},
				]),
			],
			update: [startUpdate],
		});
		const expected = snapshot("ASSISTANT_SPEAKING");
		jest.spyOn(service, "findSnapshot").mockResolvedValue(expected);

		await expect(service.start(attemptId, candidate)).resolves.toEqual({
			snapshot: expected,
			shouldRunAssistant: true,
		});
		expect(startUpdate.set).toHaveBeenCalledWith(
			expect.objectContaining({
				state: "ASSISTANT_SPEAKING",
				startedAt,
				deadlineAt: new Date("2026-08-01T00:30:00.000Z"),
			}),
		);
	});

	it.each(["COMPLETED", "FAILED"] as const)(
		"rejects starting a terminal %s attempt",
		async (state) => {
			const { service } = createService({
				select: [
					query([{ state, durationMinutes: 30, updatedAt: new Date() }]),
				],
			});

			await expect(service.start(attemptId, candidate)).rejects.toThrow(
				ConflictException,
			);
		},
	);

	it("does not steal a fresh PROCESSING attempt during reconnect", async () => {
		const { database, service } = createService({
			select: [
				query([
					{
						state: "PROCESSING",
						durationMinutes: 30,
						updatedAt: new Date(),
					},
				]),
			],
		});
		const expected = snapshot("PROCESSING");
		jest.spyOn(service, "findSnapshot").mockResolvedValue(expected);

		await expect(service.start(attemptId, candidate)).resolves.toEqual({
			snapshot: expected,
			shouldRunAssistant: false,
		});
		expect(database.update).not.toHaveBeenCalled();
	});

	it("recovers stale PROCESSING work for an assistant replay", async () => {
		const recovery = query([]);
		const { database, service } = createService({
			select: [
				query([
					{
						state: "PROCESSING",
						durationMinutes: 30,
						updatedAt: new Date(Date.now() - 3 * 60_000 - 1),
					},
				]),
			],
			update: [recovery],
		});
		const expected = snapshot("ASSISTANT_SPEAKING");
		jest.spyOn(service, "findSnapshot").mockResolvedValue(expected);

		await expect(service.start(attemptId, candidate)).resolves.toEqual({
			snapshot: expected,
			shouldRunAssistant: true,
		});
		expect(database.update).toHaveBeenCalledTimes(1);
		expect(recovery.set).toHaveBeenCalledWith(
			expect.objectContaining({ state: "ASSISTANT_SPEAKING" }),
		);
	});

	it("accepts microphone input only while listening", async () => {
		const listening = createService({
			select: [query([attemptRow("LISTENING")])],
		});
		const speaking = createService({
			select: [query([attemptRow("ASSISTANT_SPEAKING")])],
		});

		await expect(
			listening.service.assertListening(attemptId, candidate),
		).resolves.toBeUndefined();
		await expect(
			speaking.service.assertListening(attemptId, candidate),
		).rejects.toThrow(ConflictException);
	});

	it("treats a replayed candidate turn ID as an idempotent duplicate", async () => {
		const { database, service } = createService({
			select: [query([{ id: "persisted-turn" }])],
		});

		await expect(
			service.claimCandidateTurn(attemptId, clientTurnId, candidate),
		).resolves.toEqual({ claimed: false, duplicate: true });
		expect(database.update).not.toHaveBeenCalled();
	});

	it("loses a candidate-turn compare-and-set cleanly and enforces a future deadline", async () => {
		const claimQuery = query([]);
		const { service } = createService({
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

	it("restores listening after a recoverable candidate-turn failure", async () => {
		const restore = query([]);
		const { service } = createService({ update: [restore] });
		const expected = snapshot("LISTENING");
		jest.spyOn(service, "findSnapshot").mockResolvedValue(expected);

		await expect(service.restoreListening(attemptId, candidate)).resolves.toBe(
			expected,
		);
		expect(restore.set).toHaveBeenCalledWith(
			expect.objectContaining({ state: "LISTENING" }),
		);
	});

	it("finishes assistant speech and returns the resulting snapshot", async () => {
		const finish = query([]);
		const { service } = createService({ update: [finish] });
		const expected = snapshot("COMPLETED");
		jest.spyOn(service, "findSnapshot").mockResolvedValue(expected);

		await expect(
			service.finishAssistantSpeech(attemptId, candidate),
		).resolves.toBe(expected);
		const compiled = compiledWhere(finish);
		expect(compiled.params).toEqual(
			expect.arrayContaining([
				attemptId,
				candidate.id,
				"ASSISTANT_SPEAKING",
				"ENDING",
			]),
		);
	});

	it("claims a deadline only through allowed active states and an expired-time predicate", async () => {
		const claimQuery = query([{ id: attemptId }]);
		const { service } = createService({ update: [claimQuery] });

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
		const { service } = createService({ update: [query([])] });

		await expect(service.claimDeadline(attemptId, candidate)).resolves.toBe(
			false,
		);
	});

	it("updates media for an active attempt", async () => {
		const update = query([{ id: attemptId }]);
		const { service } = createService({ update: [update] });
		const expected = snapshot("LISTENING");
		jest.spyOn(service, "findSnapshot").mockResolvedValue(expected);
		const media = {
			cameraActive: true,
			screenActive: true,
			microphoneActive: true,
		};

		await expect(
			service.updateMedia(attemptId, candidate, media),
		).resolves.toBe(expected);
		expect(update.set).toHaveBeenCalledWith(expect.objectContaining(media));
	});

	it.each(["COMPLETED", "FAILED"] as const)(
		"rejects media mutation for a %s attempt",
		async (state) => {
			const mediaUpdate = query([]);
			const { service } = createService({
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
		},
	);

	it("hides attempt ownership when a rejected media update finds no owned row", async () => {
		const { service } = createService({
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

	it("fails an active attempt for integrity and clears all media flags", async () => {
		jest.useFakeTimers();
		const endedAt = new Date("2026-08-01T00:10:00.000Z");
		jest.setSystemTime(endedAt);
		const failure = query([{ id: attemptId }]);
		const { service } = createService({ update: [failure] });
		const expected = snapshot("FAILED");
		jest.spyOn(service, "findSnapshot").mockResolvedValue(expected);

		await expect(service.failForIntegrity(attemptId, candidate)).resolves.toBe(
			expected,
		);
		expect(failure.set).toHaveBeenCalledWith(
			expect.objectContaining({
				state: "FAILED",
				endedAt,
				cameraActive: false,
				screenActive: false,
				microphoneActive: false,
			}),
		);
	});
});
