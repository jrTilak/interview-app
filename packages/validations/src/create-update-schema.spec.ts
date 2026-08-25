import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createUpdateSchema } from "./create-update-schema.js";

const CreateProfileSchema = z
	.object({
		name: z.string().min(2),
		age: z.number().int().positive(),
	})
	.strict();

describe("createUpdateSchema", () => {
	it("makes every create field optional", () => {
		const UpdateProfileSchema = createUpdateSchema(CreateProfileSchema);

		expect(UpdateProfileSchema.parse({ name: "Ada" })).toEqual({ name: "Ada" });
		expect(UpdateProfileSchema.parse({ age: 36 })).toEqual({ age: 36 });
	});

	it("rejects an update without any fields", () => {
		const UpdateProfileSchema = createUpdateSchema(CreateProfileSchema);

		expect(UpdateProfileSchema.safeParse({}).success).toBe(false);
	});

	it("supports a custom empty-update message", () => {
		const message = "At least one profile field is required";
		const UpdateProfileSchema = createUpdateSchema(
			CreateProfileSchema,
			message,
		);
		const result = UpdateProfileSchema.safeParse({});

		expect(result.error?.issues[0]?.message).toBe(message);
	});
});
