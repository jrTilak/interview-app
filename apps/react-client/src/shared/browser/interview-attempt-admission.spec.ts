import { beforeEach, describe, expect, it } from "vitest";
import {
	consumeInterviewAttemptHandoff,
	hasInterviewAttemptHandoff,
	hasStartedInterviewAttempt,
	prepareInterviewAttemptHandoff,
} from "./interview-attempt-admission";

beforeEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
});

describe("interview attempt admission", () => {
	it("grants only the first lobby-to-room navigation", () => {
		const attemptId = "attempt-first-handoff";

		expect(hasStartedInterviewAttempt(attemptId)).toBe(false);
		expect(prepareInterviewAttemptHandoff(attemptId)).toBe(true);
		expect(hasStartedInterviewAttempt(attemptId)).toBe(true);
		expect(hasInterviewAttemptHandoff(attemptId)).toBe(true);
		consumeInterviewAttemptHandoff(attemptId);
		expect(hasInterviewAttemptHandoff(attemptId)).toBe(false);
	});

	it("refuses to prepare an attempt that was already opened", () => {
		const attemptId = "attempt-already-opened";

		expect(prepareInterviewAttemptHandoff(attemptId)).toBe(true);
		expect(prepareInterviewAttemptHandoff(attemptId)).toBe(false);
	});

	it("rejects a direct room URL without a lobby handoff", () => {
		expect(hasInterviewAttemptHandoff("attempt-direct-link")).toBe(false);
	});
});
