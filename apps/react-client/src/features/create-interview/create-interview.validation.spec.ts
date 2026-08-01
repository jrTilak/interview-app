import { describe, expect, it } from "vitest";
import { CreateInterviewSchema } from "./create-interview.validation";

const validDraft = {
	description: "A final round interview",
	durationMinutes: 30,
	rawQuestions: "Ask for an introduction.",
	title: "Frontend interview",
};

describe("CreateInterviewSchema", () => {
	it("trims creator text and converts a blank optional description to undefined", () => {
		expect(
			CreateInterviewSchema.parse({
				...validDraft,
				description: "   ",
				rawQuestions: "  Ask about testing.  ",
				title: "  Final round  ",
			}),
		).toEqual({
			description: undefined,
			durationMinutes: 30,
			rawQuestions: "Ask about testing.",
			title: "Final round",
		});
	});

	it.each([3, 160])(
		"accepts a trimmed title at the %i character boundary",
		(length) => {
			expect(
				CreateInterviewSchema.safeParse({
					...validDraft,
					title: ` ${"t".repeat(length)} `,
				}).success,
			).toBe(true);
		},
	);

	it.each([2, 161])(
		"rejects a trimmed title outside the boundary at %i characters",
		(length) => {
			expect(
				CreateInterviewSchema.safeParse({
					...validDraft,
					title: ` ${"t".repeat(length)} `,
				}).success,
			).toBe(false);
		},
	);

	it.each([5, 120])(
		"accepts a duration at the %i minute boundary",
		(durationMinutes) => {
			expect(
				CreateInterviewSchema.safeParse({ ...validDraft, durationMinutes })
					.success,
			).toBe(true);
		},
	);

	it.each([4, 5.5, 121, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects an invalid numeric duration %s",
		(durationMinutes) => {
			expect(
				CreateInterviewSchema.safeParse({ ...validDraft, durationMinutes })
					.success,
			).toBe(false);
		},
	);

	it("does not coerce a string duration", () => {
		expect(
			CreateInterviewSchema.safeParse({
				...validDraft,
				durationMinutes: "30",
			}).success,
		).toBe(false);
	});

	it("enforces the description limit after trimming", () => {
		expect(
			CreateInterviewSchema.safeParse({
				...validDraft,
				description: ` ${"d".repeat(2000)} `,
			}).success,
		).toBe(true);
		expect(
			CreateInterviewSchema.safeParse({
				...validDraft,
				description: "d".repeat(2001),
			}).success,
		).toBe(false);
	});

	it.each([3, 20_000])(
		"accepts trimmed question notes at the %i character boundary",
		(length) => {
			expect(
				CreateInterviewSchema.safeParse({
					...validDraft,
					rawQuestions: ` ${"q".repeat(length)} `,
				}).success,
			).toBe(true);
		},
	);

	it.each([0, 2, 20_001])(
		"rejects trimmed question notes outside the boundary at %i characters",
		(length) => {
			expect(
				CreateInterviewSchema.safeParse({
					...validDraft,
					rawQuestions: ` ${"q".repeat(length)} `,
				}).success,
			).toBe(false);
		},
	);
});
