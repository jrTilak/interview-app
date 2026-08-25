import {
	CreateInterviewSchema,
	InterviewIdParamsSchema,
	UpdateInterviewSchema,
} from "./request.dto.js";

const validInput = {
	title: "Frontend interview",
	rawQuestions: "Ask about React hooks",
	durationMinutes: 30,
};

const interviewId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";

describe("interview request schemas", () => {
	it("normalizes a valid create request", () => {
		const result = CreateInterviewSchema.parse({
			...validInput,
			title: "  Frontend interview  ",
		});

		expect(result.title).toBe("Frontend interview");
		expect(result.durationMinutes).toBe(30);
		expect(result).not.toHaveProperty("allowMultipleAttempts");
	});

	it("rejects unknown fields and invalid setting types", () => {
		expect(
			CreateInterviewSchema.safeParse({ ...validInput, hiddenAnswer: "no" })
				.success,
		).toBe(false);
		expect(
			CreateInterviewSchema.safeParse({
				...validInput,
				durationMinutes: "30",
			}).success,
		).toBe(false);
		expect(
			CreateInterviewSchema.safeParse({
				...validInput,
				allowMultipleAttempts: "yes",
			}).success,
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

	it("accepts partial updates and rejects empty updates", () => {
		expect(
			UpdateInterviewSchema.parse({ title: "  Platform interview  " }),
		).toEqual({ title: "Platform interview" });
		expect(UpdateInterviewSchema.safeParse({}).success).toBe(false);
		expect(UpdateInterviewSchema.parse({ durationMinutes: 1 })).toEqual({
			durationMinutes: 1,
		});
		expect(UpdateInterviewSchema.parse({ description: null })).toEqual({
			description: null,
		});
		expect(UpdateInterviewSchema.parse({ isPublic: true })).toEqual({
			isPublic: true,
		});
		expect(
			UpdateInterviewSchema.safeParse({ rawQuestions: "Do not replace these" })
				.success,
		).toBe(false);
	});
});
