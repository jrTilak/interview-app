import {
	type PipeTransform,
	type Type,
	UnprocessableEntityException,
} from "@nestjs/common";
import { createZodValidationPipe } from "nestjs-zod";
import z from "zod";

export const AppValidationPipe: Type<PipeTransform> = createZodValidationPipe({
	createValidationException: (error) =>
		new UnprocessableEntityException({
			message: "Input validation failed",
			error: error instanceof z.ZodError ? error.issues : null,
		}),
});
