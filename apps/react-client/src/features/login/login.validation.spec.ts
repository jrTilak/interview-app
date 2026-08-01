import { describe, expect, it } from "vitest";
import { LoginSchema } from "./login.validation";

const validLogin = {
	email: "candidate@example.com",
	password: "password",
};

describe("LoginSchema", () => {
	it("normalizes email without changing password characters", () => {
		expect(
			LoginSchema.parse({
				email: "  Candidate@Example.COM  ",
				password: " Password ",
			}),
		).toEqual({
			email: "candidate@example.com",
			password: " Password ",
		});
	});

	it.each([8, 128])(
		"accepts a password at the %i character boundary",
		(length) => {
			expect(
				LoginSchema.safeParse({ ...validLogin, password: "p".repeat(length) })
					.success,
			).toBe(true);
		},
	);

	it.each([7, 129])(
		"rejects a password outside the boundary at %i characters",
		(length) => {
			const result = LoginSchema.safeParse({
				...validLogin,
				password: "p".repeat(length),
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.path).toEqual(["password"]);
			}
		},
	);

	it.each(["", "candidate", "candidate@", "@example.com"])(
		"rejects invalid email input %j",
		(email) => {
			expect(LoginSchema.safeParse({ ...validLogin, email }).success).toBe(
				false,
			);
		},
	);
});
