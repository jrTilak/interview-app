import { describe, expect, it } from "vitest";
import { getSafeAuthRedirect } from "./safe-redirect";

const origin = "https://interview.example";

describe("safe authentication redirect", () => {
	it("preserves an internal shared interview deep link", () => {
		expect(
			getSafeAuthRedirect(
				"/interviews/abc_123?resume=true#device-check",
				origin,
			),
		).toBe("/interviews/abc_123?resume=true#device-check");
	});

	it("rejects protocol-relative, absolute, and malformed destinations", () => {
		for (const target of [
			"//evil.example/path",
			"https://evil.example/path",
			"not-a-path",
		]) {
			expect(getSafeAuthRedirect(target, origin)).toBe("/dashboard");
		}
	});
});
