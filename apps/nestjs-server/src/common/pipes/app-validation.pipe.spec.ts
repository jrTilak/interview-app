import {
	type ArgumentMetadata,
	UnprocessableEntityException,
} from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import z from "zod";
import { AppValidationPipe } from "./app-validation.pipe.js";

const ExampleSchema = z
	.object({
		name: z.string().trim().min(2),
		count: z.number().int().positive(),
	})
	.strict();
class ExampleDto extends createZodDto(ExampleSchema) {}

const metadata: ArgumentMetadata = {
	type: "body",
	metatype: ExampleDto,
};

describe("AppValidationPipe", () => {
	it("returns the normalized DTO value", () => {
		const pipe = new AppValidationPipe();

		expect(pipe.transform({ name: "  Ada  ", count: 1 }, metadata)).toEqual({
			name: "Ada",
			count: 1,
		});
	});

	it("returns a stable 422 body with Zod issues", () => {
		const pipe = new AppValidationPipe();

		try {
			pipe.transform({ name: "A", count: 0, unknown: true }, metadata);
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(UnprocessableEntityException);
			const response = (error as UnprocessableEntityException).getResponse();
			expect(response).toMatchObject({
				message: "Input validation failed",
				error: expect.arrayContaining([
					expect.objectContaining({ path: ["name"] }),
					expect.objectContaining({ path: ["count"] }),
				]),
			});
		}
	});
});
