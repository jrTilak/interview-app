import { CreateInterviewSchema, ShareCodeParamsSchema } from "./request.dto.js";

const validInput = {
	clientRequestId: "f1fe6e65-4d76-4d21-96dc-4a4aa841f4ea",
	title: "Frontend interview",
	rawQuestions: "Ask about React hooks",
};

describe("interview request schemas", () => {
	it("normalizes a valid create request and supplies duration", () => {
		const result = CreateInterviewSchema.parse({
			...validInput,
			title: "  Frontend interview  ",
		});

		expect(result.title).toBe("Frontend interview");
		expect(result.durationMinutes).toBe(30);
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

	it("accepts only fixed-length URL-safe share codes", () => {
		expect(
			ShareCodeParamsSchema.safeParse({
				shareCode: "uF7qP8Q3bFvLXrAQdS5kMK0pNPkVsU8_",
			}).success,
		).toBe(true);
		expect(
			ShareCodeParamsSchema.safeParse({ shareCode: "short" }).success,
		).toBe(false);
	});
});
