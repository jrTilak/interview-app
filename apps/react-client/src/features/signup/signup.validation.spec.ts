import { describe, expect, it } from "vitest";
import { SignupSchema } from "./signup.validation";

const validSignup = {
	email: "candidate@example.com",
	name: "Ada Lovelace",
	password: "password",
};

describe("SignupSchema", () => {
	it("normalizes the display name and email without trimming the password", () => {
		expect(
			SignupSchema.parse({
				email: "  Ada@Example.COM ",
				name: "  Ada Lovelace  ",
				password: " Password ",
			}),
		).toEqual({
			email: "ada@example.com",
			name: "Ada Lovelace",
			password: " Password ",
		});
	});

	it.each([2, 80])(
		"accepts a trimmed name at the %i character boundary",
		(length) => {
			expect(
				SignupSchema.safeParse({
					...validSignup,
					name: ` ${"n".repeat(length)} `,
				}).success,
			).toBe(true);
		},
	);

	it.each([1, 81])(
		"rejects a trimmed name outside the boundary at %i characters",
		(length) => {
			const result = SignupSchema.safeParse({
				...validSignup,
				name: ` ${"n".repeat(length)} `,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.path).toEqual(["name"]);
			}
		},
	);

	it.each([8, 128])(
		"accepts a password at the %i character boundary",
		(length) => {
			expect(
				SignupSchema.safeParse({
					...validSignup,
					password: "p".repeat(length),
				}).success,
			).toBe(true);
		},
	);

	it.each([7, 129])(
		"rejects a password outside the boundary at %i characters",
		(length) => {
			expect(
				SignupSchema.safeParse({
					...validSignup,
					password: "p".repeat(length),
				}).success,
			).toBe(false);
		},
	);

	it("rejects an email that is still invalid after normalization", () => {
		expect(
			SignupSchema.safeParse({ ...validSignup, email: "  not-an-email  " })
				.success,
		).toBe(false);
	});
});
