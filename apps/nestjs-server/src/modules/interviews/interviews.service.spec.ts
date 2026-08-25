import { jest } from "@jest/globals";
import {
	ConflictException,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import type { User } from "better-auth/types";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AppDatabase } from "#/db/database.provider.js";
import { interview, interviewQuestion } from "#/db/schema/index.js";
import type {
	InterviewLlmPort,
	StructuredInterviewQuestion,
} from "#/modules/ai/llm/llm.port.js";
import { InterviewsService } from "./interviews.service.js";

const owner: User = {
	id: "4b8757d8-b56b-47eb-827f-65b14977fa25",
	name: "Interview Owner",
	email: "owner@example.com",
	emailVerified: false,
	image: null,
	createdAt: new Date("2026-08-01T00:00:00.000Z"),
	updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
const firstQuestionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";
const secondQuestionId = "83e0c06d-cbbf-47db-80fe-9da1bc4d37b0";
const createdAt = new Date("2026-08-02T03:04:05.000Z");

const firstStructuredQuestion: StructuredInterviewQuestion = {
	title: "React state",
	prompt: "Explain how React state updates work.",
	objective: "Evaluate state ownership and update reasoning.",
	followUpGuidance: "Ask for a practical example.",
};

const secondStructuredQuestion: StructuredInterviewQuestion = {
	title: "Difficult bug",
	prompt: "Tell me about a difficult bug you solved.",
	objective: null,
	followUpGuidance: null,
};

const structuredQuestions = [firstStructuredQuestion, secondStructuredQuestion];

const interviewRow = {
	id: interviewId,
	title: "Junior React Developer",
	description: null,
	rawQuestions: "Ask about React state and a difficult bug.",
	durationMinutes: 30,
	allowMultipleAttempts: false,
	isPublic: false,
	createdAt,
};

const questionRows = [
	{
		id: firstQuestionId,
		position: 1,
		...firstStructuredQuestion,
	},
	{
		id: secondQuestionId,
		position: 2,
		...secondStructuredQuestion,
	},
];

type QueryChain<T> = PromiseLike<T> & {
	from: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	leftJoin: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	where: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	limit: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	orderBy: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	groupBy: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	values: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	set: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
	returning: jest.Mock<(...args: unknown[]) => QueryChain<T>>;
};

/** Creates an awaitable Drizzle query-chain double with inspectable calls. */
function query<T>(result: T): QueryChain<T> {
	const chain = {} as QueryChain<T>;
	chain.from = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.leftJoin = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.where = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.limit = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.orderBy = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.groupBy = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.values = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.set = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	chain.returning = jest.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
	// biome-ignore lint/suspicious/noThenProperty: Drizzle query doubles must support `await` at every fluent stage.
	chain.then = (onfulfilled, onrejected) =>
		Promise.resolve(result).then(onfulfilled, onrejected);
	return chain;
}

type MockDatabase = {
	select: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	insert: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	update: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
	delete: jest.Mock<(...args: unknown[]) => QueryChain<unknown>>;
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
	delete?: QueryChain<unknown>[];
}) {
	const queues = {
		select: [...(input.select ?? [])],
		insert: [...(input.insert ?? [])],
		update: [...(input.update ?? [])],
		delete: [...(input.delete ?? [])],
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
	database.delete = jest.fn<(...args: unknown[]) => QueryChain<unknown>>(() =>
		take("delete"),
	);
	database.transaction = jest.fn<
		(
			callback: (transaction: MockDatabase) => Promise<unknown>,
		) => Promise<unknown>
	>((callback) => callback(database));
	return database;
}

/** Returns a typed LLM double whose structure result can be changed per test. */
function llmMock(
	questions: StructuredInterviewQuestion[] = structuredQuestions,
): jest.Mocked<InterviewLlmPort> {
	return {
		structureQuestions: jest
			.fn<InterviewLlmPort["structureQuestions"]>()
			.mockResolvedValue(questions),
		generateTurn: jest.fn<InterviewLlmPort["generateTurn"]>(),
	};
}

/** Creates a service around the supplied doubles. */
function createService(database: MockDatabase, llm = llmMock()) {
	return new InterviewsService(database as unknown as AppDatabase, llm);
}

/** Compiles a Drizzle SQL expression so its scope and parameters are visible. */
function compileSql(expression: unknown) {
	return new PgDialect().sqlToQuery(expression as SQL);
}

/** Reads and compiles the first predicate supplied to a query chain. */
function compiledWhere(chain: QueryChain<unknown>) {
	const condition = chain.where.mock.calls[0]?.[0];
	if (!condition) throw new Error("Expected a Drizzle where condition");
	return compileSql(condition);
}

describe("InterviewsService", () => {
	afterEach(() => jest.restoreAllMocks());

	it("structures and transactionally persists an ordered interview plan", async () => {
		const created = query([{ id: interviewId }]);
		const insertedQuestions = query([]);
		const details = query([interviewRow]);
		const questions = query(questionRows);
		const database = databaseMock({
			insert: [created, insertedQuestions],
			select: [details, questions],
		});
		const llm = llmMock();
		const service = createService(database, llm);
		const data = {
			title: interviewRow.title,
			rawQuestions: interviewRow.rawQuestions,
			durationMinutes: 30,
		};

		await expect(service.create(data, owner)).resolves.toEqual({
			...interviewRow,
			createdAt: createdAt.toISOString(),
			questionCount: 2,
			questions: questionRows,
		});

		expect(llm.structureQuestions).toHaveBeenCalledWith({
			interviewTitle: data.title,
			interviewDescription: null,
			rawQuestions: data.rawQuestions,
		});
		expect(database.transaction).toHaveBeenCalledTimes(1);
		expect(database.insert.mock.calls.map(([table]) => table)).toEqual([
			interview,
			interviewQuestion,
		]);
		expect(created.values).toHaveBeenCalledWith({
			createdById: owner.id,
			title: data.title,
			description: null,
			rawQuestions: data.rawQuestions,
			durationMinutes: 30,
			allowMultipleAttempts: undefined,
		});
		expect(insertedQuestions.values).toHaveBeenCalledWith([
			{ interviewId, position: 1, ...structuredQuestions[0] },
			{ interviewId, position: 2, ...structuredQuestions[1] },
		]);
		expect(compiledWhere(details).params).toEqual([interviewId, owner.id]);
		expect(compileSql(questions.orderBy.mock.calls[0]?.[0]).sql).toContain(
			'"interview_question"."position" asc',
		);
	});

	it("passes an explicit description and attempt setting to the provider and database", async () => {
		const description = "A focused project interview.";
		const created = query([{ id: interviewId }]);
		const database = databaseMock({
			insert: [created, query([])],
			select: [
				query([{ ...interviewRow, description, allowMultipleAttempts: true }]),
				query(questionRows),
			],
		});
		const llm = llmMock();
		const service = createService(database, llm);

		await service.create(
			{
				title: interviewRow.title,
				description,
				rawQuestions: interviewRow.rawQuestions,
				durationMinutes: 45,
				allowMultipleAttempts: true,
			},
			owner,
		);

		expect(llm.structureQuestions).toHaveBeenCalledWith(
			expect.objectContaining({ interviewDescription: description }),
		);
		expect(created.values).toHaveBeenCalledWith(
			expect.objectContaining({
				description,
				durationMinutes: 45,
				allowMultipleAttempts: true,
			}),
		);
	});

	it("maps provider failure to service unavailability before opening a transaction", async () => {
		const database = databaseMock({});
		const llm = llmMock();
		const providerError = new Error("provider unavailable");
		llm.structureQuestions.mockRejectedValue(providerError);
		const logger = jest
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => undefined);
		const service = createService(database, llm);

		await expect(
			service.create(
				{
					title: interviewRow.title,
					rawQuestions: interviewRow.rawQuestions,
					durationMinutes: 30,
				},
				owner,
			),
		).rejects.toThrow(
			"The interview topics could not be prepared. Please retry.",
		);

		expect(logger).toHaveBeenCalledWith(
			"Interview topic structuring failed",
			providerError,
		);
		expect(database.transaction).not.toHaveBeenCalled();
		expect(database.insert).not.toHaveBeenCalled();
	});

	it("fails creation when PostgreSQL does not return an inserted interview", async () => {
		const database = databaseMock({ insert: [query([])] });
		const service = createService(database);

		await expect(
			service.create(
				{
					title: interviewRow.title,
					rawQuestions: interviewRow.rawQuestions,
					durationMinutes: 30,
				},
				owner,
			),
		).rejects.toBeInstanceOf(ServiceUnavailableException);

		expect(database.insert).toHaveBeenCalledTimes(1);
		expect(database.select).not.toHaveBeenCalled();
	});

	it("fails creation when the committed interview cannot be reloaded", async () => {
		const database = databaseMock({
			insert: [query([{ id: interviewId }]), query([])],
			select: [query([])],
		});
		const service = createService(database);

		await expect(
			service.create(
				{
					title: interviewRow.title,
					rawQuestions: interviewRow.rawQuestions,
					durationMinutes: 30,
				},
				owner,
			),
		).rejects.toThrow("Interview could not be loaded");

		expect(database.select).toHaveBeenCalledTimes(1);
	});

	it("lists only creator-owned summaries with normalized counts and dates", async () => {
		const list = query([
			{
				id: interviewId,
				title: interviewRow.title,
				description: interviewRow.description,
				durationMinutes: interviewRow.durationMinutes,
				allowMultipleAttempts: interviewRow.allowMultipleAttempts,
				isPublic: interviewRow.isPublic,
				createdAt,
				questionCount: "2",
			},
		]);
		const database = databaseMock({ select: [list] });
		const service = createService(database);

		await expect(service.findAllOwned(owner)).resolves.toEqual([
			{
				id: interviewId,
				title: interviewRow.title,
				description: null,
				durationMinutes: 30,
				allowMultipleAttempts: false,
				isPublic: false,
				createdAt: createdAt.toISOString(),
				questionCount: 2,
			},
		]);

		expect(compiledWhere(list).params).toEqual([owner.id]);
		expect(list.leftJoin).toHaveBeenCalledTimes(1);
		expect(list.groupBy).toHaveBeenCalledTimes(1);
		expect(compileSql(list.orderBy.mock.calls[0]?.[0]).sql).toContain(
			'"interview"."created_at" desc',
		);
	});

	it("returns owned details with the ordered question plan", async () => {
		const details = query([interviewRow]);
		const questions = query(questionRows);
		const database = databaseMock({ select: [details, questions] });
		const service = createService(database);

		await expect(service.findOwnedById(interviewId, owner)).resolves.toEqual({
			...interviewRow,
			createdAt: createdAt.toISOString(),
			questionCount: 2,
			questions: questionRows,
		});

		expect(compiledWhere(details).params).toEqual([interviewId, owner.id]);
		expect(compiledWhere(questions).params).toEqual([interviewId]);
	});

	it("hides missing and foreign interviews without querying their questions", async () => {
		const details = query([]);
		const database = databaseMock({ select: [details] });
		const service = createService(database);

		await expect(service.findOwnedById(interviewId, owner)).rejects.toThrow(
			NotFoundException,
		);

		expect(compiledWhere(details).params).toEqual([interviewId, owner.id]);
		expect(database.select).toHaveBeenCalledTimes(1);
	});

	it("updates an owner-scoped interview and reloads its details", async () => {
		const update = query([{ id: interviewId }]);
		const updatedRow = {
			...interviewRow,
			description: "Updated context.",
			isPublic: true,
		};
		const database = databaseMock({
			update: [update],
			select: [query([updatedRow]), query(questionRows)],
		});
		const service = createService(database);
		const changes = { description: "Updated context.", isPublic: true };

		await expect(
			service.update(interviewId, changes, owner),
		).resolves.toMatchObject({
			id: interviewId,
			description: "Updated context.",
			isPublic: true,
			questions: questionRows,
		});

		expect(update.set).toHaveBeenCalledWith(changes);
		expect(compiledWhere(update).params).toEqual([interviewId, owner.id]);
		expect(database.select).toHaveBeenCalledTimes(2);
	});

	it("hides a foreign update and does not attempt to reload it", async () => {
		const update = query([]);
		const database = databaseMock({ update: [update] });
		const service = createService(database);

		await expect(
			service.update(interviewId, { isPublic: true }, owner),
		).rejects.toThrow(NotFoundException);

		expect(compiledWhere(update).params).toEqual([interviewId, owner.id]);
		expect(database.select).not.toHaveBeenCalled();
	});

	it("hides a missing or foreign interview before checking delete usage", async () => {
		const owned = query([]);
		const database = databaseMock({ select: [owned] });
		const service = createService(database);

		await expect(service.remove(interviewId, owner)).rejects.toThrow(
			NotFoundException,
		);

		expect(compiledWhere(owned).params).toEqual([interviewId, owner.id]);
		expect(database.select).toHaveBeenCalledTimes(1);
		expect(database.delete).not.toHaveBeenCalled();
	});

	it("refuses to delete an interview with candidate attempts", async () => {
		const owned = query([{ id: interviewId }]);
		const usage = query([{ count: "1" }]);
		const database = databaseMock({ select: [owned, usage] });
		const service = createService(database);

		await expect(service.remove(interviewId, owner)).rejects.toThrow(
			ConflictException,
		);

		expect(compiledWhere(usage).params).toEqual([interviewId]);
		expect(database.delete).not.toHaveBeenCalled();
	});

	it.each([
		["a zero count", [{ count: "0" }]],
		["no aggregate row", []],
	] as const)(
		"deletes an unused owned interview with %s",
		async (_label, rows) => {
			const deletion = query([]);
			const database = databaseMock({
				select: [query([{ id: interviewId }]), query(rows)],
				delete: [deletion],
			});
			const service = createService(database);

			await expect(service.remove(interviewId, owner)).resolves.toEqual({
				id: interviewId,
			});

			expect(compiledWhere(deletion).params).toEqual([interviewId, owner.id]);
			expect(database.delete).toHaveBeenCalledTimes(1);
		},
	);

	it("returns only candidate-safe metadata for a public preview", async () => {
		const preview = query([
			{
				title: interviewRow.title,
				description: interviewRow.description,
				durationMinutes: interviewRow.durationMinutes,
				allowMultipleAttempts: interviewRow.allowMultipleAttempts,
				questionCount: "2",
			},
		]);
		const database = databaseMock({ select: [preview] });
		const service = createService(database);

		await expect(service.findSharedPreview(interviewId)).resolves.toEqual({
			title: interviewRow.title,
			description: null,
			durationMinutes: 30,
			allowMultipleAttempts: false,
			questionCount: 2,
		});

		expect(compiledWhere(preview).params).toEqual([interviewId, true]);
		expect(Object.keys(database.select.mock.calls[0]?.[0] as object)).toEqual([
			"title",
			"description",
			"durationMinutes",
			"allowMultipleAttempts",
			"questionCount",
		]);
	});

	it("hides a missing or private shared preview", async () => {
		const preview = query([]);
		const database = databaseMock({ select: [preview] });
		const service = createService(database);

		await expect(service.findSharedPreview(interviewId)).rejects.toThrow(
			"Shared interview does not exist",
		);

		expect(compiledWhere(preview).params).toEqual([interviewId, true]);
	});
});
