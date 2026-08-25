import type { z } from "zod";

/**
 * Creates an update schema by making every field optional while rejecting
 * requests that do not contain at least one field.
 *
 * @param schema - The create schema from which to derive the update schema.
 * @param message - The validation message returned for an empty object.
 */
export const createUpdateSchema = <TSchema extends z.ZodObject>(
	schema: TSchema,
	message = "At least one field is required",
) => schema.partial().refine((data) => Object.keys(data).length > 0, message);
