import { describe, expect, it } from "vitest";
import { formatLatency, getLatencyQuality } from "./latency";

describe("interview latency", () => {
	it.each([
		[null, "unknown"],
		[-1, "unknown"],
		[Number.NaN, "unknown"],
		[0, "excellent"],
		[100, "excellent"],
		[101, "stable"],
		[250, "stable"],
		[251, "high"],
	] as const)("classifies %s ms as %s", (latency, quality) => {
		expect(getLatencyQuality(latency)).toBe(quality);
	});

	it("formats only the rounded round-trip value", () => {
		expect(formatLatency(null)).toBe("— ms");
		expect(formatLatency(42.6)).toBe("43 ms");
	});
});
