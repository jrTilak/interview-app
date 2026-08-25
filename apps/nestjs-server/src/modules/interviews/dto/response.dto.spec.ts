import {
	DeletedInterviewResponseSchema,
	InterviewDetailsResponseSchema,
	InterviewQuestionResponseSchema,
	InterviewSummaryResponseSchema,
	SharedInterviewPreviewResponseSchema,
} from "./response.dto.js";

const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";

const question = {
	id: questionId,
	position: 1,
	title: "React state",
	prompt: "Explain how React state updates work.",
	objective: null,
	followUpGuidance: "Ask for a practical example.",
};

const summary = {
	id: interviewId,
	title: "Junior React Developer",
	description: null,
	durationMinutes: 30,
	allowMultipleAttempts: false,
	questionCount: 1,
	isPublic: false,
	createdAt: "2026-08-02T03:04:05.000Z",
};

const details = {
	...summary,
	rawQuestions: "Ask about React state.",
	questions: [question],
};

describe("interview response schemas", () => {
	it("accepts and normalizes the complete creator detail contract", () => {
		const result = InterviewDetailsResponseSchema.parse({
			...details,
			title: "  Junior React Developer  ",
			rawQuestions: "  Ask about React state.  ",
			questions: [
				{
					...question,
					title: "  React state  ",
					prompt: "  Explain how React state updates work.  ",
					followUpGuidance: "  Ask for a practical example.  ",
				},
			],
		});

		expect(result).toEqual(details);
	});

	it("accepts nullable question guidance and rejects unknown nested fields", () => {
		expect(
			InterviewQuestionResponseSchema.parse({
				...question,
				objective: null,
				followUpGuidance: null,
			}),
		).toEqual({ ...question, objective: null, followUpGuidance: null });
		expect(
			InterviewQuestionResponseSchema.safeParse({
				...question,
				providerScore: 0.9,
			}).success,
		).toBe(false);
	});

	it.each([
		["an invalid interview UUID", { ...summary, id: "not-a-uuid" }],
		["a non-numeric question count", { ...summary, questionCount: "1" }],
		[
			"a Date object instead of an API timestamp",
			{ ...summary, createdAt: new Date() },
		],
		[
			"a timestamp without timezone information",
			{ ...summary, createdAt: "2026-08-02T03:04:05" },
		],
		["an unknown summary field", { ...summary, internalOwnerId: "private" }],
	] as const)("rejects %s", (_label, value) => {
		expect(InterviewSummaryResponseSchema.safeParse(value).success).toBe(false);
	});

	it("requires private notes and the structured plan for creator details", () => {
		const { rawQuestions: _rawQuestions, ...withoutNotes } = details;
		const { questions: _questions, ...withoutQuestions } = details;

		expect(InterviewDetailsResponseSchema.safeParse(withoutNotes).success).toBe(
			false,
		);
		expect(
			InterviewDetailsResponseSchema.safeParse(withoutQuestions).success,
		).toBe(false);
	});

	it("keeps the public preview contract candidate-safe and strict", () => {
		const safePreview = {
			title: summary.title,
			description: summary.description,
			durationMinutes: summary.durationMinutes,
			allowMultipleAttempts: summary.allowMultipleAttempts,
			questionCount: summary.questionCount,
		};

		expect(SharedInterviewPreviewResponseSchema.parse(safePreview)).toEqual(
			safePreview,
		);
		expect(
			SharedInterviewPreviewResponseSchema.safeParse({
				...safePreview,
				rawQuestions: details.rawQuestions,
				questions: details.questions,
			}).success,
		).toBe(false);
		expect(
			SharedInterviewPreviewResponseSchema.safeParse({
				...safePreview,
				id: interviewId,
				isPublic: true,
			}).success,
		).toBe(false);
	});

	it("accepts only a UUID in the deleted-interview response", () => {
		expect(DeletedInterviewResponseSchema.parse({ id: interviewId })).toEqual({
			id: interviewId,
		});
		expect(
			DeletedInterviewResponseSchema.safeParse({
				id: interviewId,
				deleted: true,
			}).success,
		).toBe(false);
		expect(
			DeletedInterviewResponseSchema.safeParse({ id: "not-a-uuid" }).success,
		).toBe(false);
	});
});
