import { describe, expect, it } from "vitest";
import { formatCountdown, getRemainingSeconds } from "./deadline";

describe("interview deadline countdown", () => {
	it("uses the server deadline and clamps expired rooms", () => {
		const now = new Date("2026-08-01T12:00:00.000Z").getTime();
		expect(getRemainingSeconds("2026-08-01T12:01:30.000Z", now)).toBe(90);
		expect(getRemainingSeconds("2026-08-01T11:59:00.000Z", now)).toBe(0);
	});

	it("formats missing, minute, and hour values", () => {
		expect(formatCountdown(null)).toBe("--:--");
		expect(formatCountdown(90)).toBe("01:30");
		expect(formatCountdown(3_661)).toBe("1:01:01");
	});
});
