import { describe, expect, it } from "vitest";
import {
	DESCRIPTION_LENGTH,
	DescriptionSchema,
	EMAIL_LENGTH,
	EmailSchema,
	NAME_LENGTH,
	NameSchema,
	PASSWORD_LENGTH,
	PasswordSchema,
	TITLE_LENGTH,
	TitleSchema,
	UuidSchema,
} from "./index.js";

describe("shared string schemas", () => {
	it("normalizes names and enforces their boundaries after trimming", () => {
		expect(NameSchema.parse("  Ada Lovelace  ")).toBe("Ada Lovelace");
		expect(NameSchema.safeParse("n".repeat(NAME_LENGTH.min - 1)).success).toBe(
			false,
		);
		expect(NameSchema.safeParse("n".repeat(NAME_LENGTH.max)).success).toBe(
			true,
		);
		expect(NameSchema.safeParse("n".repeat(NAME_LENGTH.max + 1)).success).toBe(
			false,
		);
	});

	it("normalizes email addresses and enforces their boundaries", () => {
		expect(EmailSchema.parse("  ADA@EXAMPLE.COM ")).toBe("ada@example.com");
		expect(
			EmailSchema.safeParse("x".repeat(EMAIL_LENGTH.max + 1)).success,
		).toBe(false);
		expect(EmailSchema.safeParse("not-an-email").success).toBe(false);
	});

	it("validates passwords without changing their content", () => {
		const password = ` ${"p".repeat(PASSWORD_LENGTH.min - 2)} `;
		expect(PasswordSchema.parse(password)).toBe(password);
		expect(
			PasswordSchema.safeParse("p".repeat(PASSWORD_LENGTH.min - 1)).success,
		).toBe(false);
		expect(
			PasswordSchema.safeParse("p".repeat(PASSWORD_LENGTH.max + 1)).success,
		).toBe(false);
	});

	it.each([
		["title", TitleSchema, TITLE_LENGTH],
		["description", DescriptionSchema, DESCRIPTION_LENGTH],
	] as const)("trims and bounds %s values", (_label, schema, length) => {
		expect(schema.parse(` ${"x".repeat(length.min)} `)).toBe(
			"x".repeat(length.min),
		);
		expect(schema.safeParse("x".repeat(length.max)).success).toBe(true);
		expect(schema.safeParse("x".repeat(length.max + 1)).success).toBe(false);
	});
});

describe("shared format schemas", () => {
	it("accepts UUIDs and rejects other identifiers", () => {
		expect(UuidSchema.parse("7635f24a-adb3-457c-8e43-2d0a1a8fa0df")).toBe(
			"7635f24a-adb3-457c-8e43-2d0a1a8fa0df",
		);
		expect(UuidSchema.safeParse("not-a-uuid").success).toBe(false);
	});

	it("remains composable for optional and nullable fields", () => {
		const OptionalDescriptionSchema = DescriptionSchema.nullable().optional();

		expect(OptionalDescriptionSchema.parse(undefined)).toBeUndefined();
		expect(OptionalDescriptionSchema.parse(null)).toBeNull();
	});
});
