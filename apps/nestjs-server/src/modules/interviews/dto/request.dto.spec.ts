import {
	CreateInterviewSchema,
	InterviewIdParamsSchema,
	UpdateInterviewSchema,
} from "./request.dto.js";

const validInput = {
	title: "Frontend interview",
	rawQuestions: "Ask about React hooks",
};

const interviewId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";

describe("interview request schemas", () => {
	it("normalizes a valid create request and supplies safe defaults", () => {
		const result = CreateInterviewSchema.parse({
			...validInput,
			title: "  Frontend interview  ",
		});

		expect(result.title).toBe("Frontend interview");
		expect(result.durationMinutes).toBe(30);
		expect(result.allowMultipleAttempts).toBe(false);
	});

	it("rejects unknown fields and out-of-range durations", () => {
		expect(
			CreateInterviewSchema.safeParse({ ...validInput, hiddenAnswer: "no" })
				.success,
		).toBe(false);
		expect(
			CreateInterviewSchema.safeParse({ ...validInput, durationMinutes: 4 })
				.success,
		).toBe(false);
		expect(
			CreateInterviewSchema.safeParse({ ...validInput, durationMinutes: 121 })
				.success,
		).toBe(false);
	});

	it("uses a UUID interview ID as the share identifier", () => {
		expect(InterviewIdParamsSchema.safeParse({ id: interviewId }).success).toBe(
			true,
		);
		expect(
			InterviewIdParamsSchema.safeParse({ id: "not-an-interview-uuid" })
				.success,
		).toBe(false);
	});

	it("accepts bounded partial updates and rejects empty updates", () => {
		expect(
			UpdateInterviewSchema.parse({ title: "  Platform interview  " }),
		).toEqual({ title: "Platform interview" });
		expect(UpdateInterviewSchema.safeParse({}).success).toBe(false);
		expect(
			UpdateInterviewSchema.safeParse({ durationMinutes: 1 }).success,
		).toBe(false);
		expect(UpdateInterviewSchema.parse({ description: null })).toEqual({
			description: null,
		});
		expect(UpdateInterviewSchema.parse({ isPublic: true })).toEqual({
			isPublic: true,
		});
	});
});
