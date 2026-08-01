import { describe, expect, it } from "vitest";
import { requireResponseData } from "./response";

describe("requireResponseData", () => {
	it("returns the exact data reference from a complete response", () => {
		const data = { id: "interview-1" };

		expect(requireResponseData({ data })).toBe(data);
	});

	it.each([
		["null", null],
		["false", false],
		["zero", 0],
		["an empty string", ""],
	] as const)("accepts %s as intentionally returned data", (_label, data) => {
		expect(requireResponseData({ data })).toBe(data);
	});

	it.each([{}, { data: undefined }])(
		"rejects a success envelope whose data is undefined",
		(response) => {
			expect(() => requireResponseData(response)).toThrowError(
				"The server returned an incomplete response.",
			);
		},
	);
});
