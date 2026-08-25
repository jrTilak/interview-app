import { stringAsBoolean, stringAsInteger } from "./string-value.js";

describe("string-backed value schemas", () => {
	it("coerces integer strings and applies a missing-value default", () => {
		const schema = stringAsInteger({ defaultValue: 30 });

		expect(schema.parse("42")).toBe(42);
		expect(schema.parse(undefined)).toBe(30);
		expect(schema.parse(null)).toBe(30);
	});

	it("enforces integer bounds after coercion", () => {
		const schema = stringAsInteger({ minimum: 2, maximum: 4 });

		expect(schema.parse("2")).toBe(2);
		expect(schema.parse("4")).toBe(4);
		expect(schema.safeParse("1").success).toBe(false);
		expect(schema.safeParse("5").success).toBe(false);
		expect(schema.safeParse("2.5").success).toBe(false);
		expect(schema.safeParse("not-a-number").success).toBe(false);
	});

	it("accepts only conventional boolean strings", () => {
		expect(stringAsBoolean.parse("true")).toBe(true);
		expect(stringAsBoolean.parse("false")).toBe(false);
		expect(stringAsBoolean.safeParse("TRUE").success).toBe(false);
		expect(stringAsBoolean.safeParse("1").success).toBe(false);
		expect(stringAsBoolean.safeParse(true).success).toBe(false);
	});
});
