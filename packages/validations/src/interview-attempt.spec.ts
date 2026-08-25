import { describe, expect, it } from "vitest";
import {
	ATTEMPT_END_REASONS,
	ATTEMPT_STATES,
	AttemptEndReasonSchema,
	AttemptStateSchema,
	INTERVIEW_TURN_ROLES,
	InterviewTurnRoleSchema,
} from "./interview-attempt.js";

describe("interview attempt contracts", () => {
	it.each(ATTEMPT_STATES)("accepts attempt state %s", (state) => {
		expect(AttemptStateSchema.parse(state)).toBe(state);
	});

	it.each(ATTEMPT_END_REASONS)("accepts attempt end reason %s", (reason) => {
		expect(AttemptEndReasonSchema.parse(reason)).toBe(reason);
	});

	it.each(INTERVIEW_TURN_ROLES)("accepts interview turn role %s", (role) => {
		expect(InterviewTurnRoleSchema.parse(role)).toBe(role);
	});

	it("rejects values outside the shared contracts", () => {
		expect(AttemptStateSchema.safeParse("STARTED").success).toBe(false);
		expect(AttemptEndReasonSchema.safeParse("CANCELLED").success).toBe(false);
		expect(InterviewTurnRoleSchema.safeParse("system").success).toBe(false);
	});
});
