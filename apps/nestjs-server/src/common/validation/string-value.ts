import z from "zod";

/** Creates a reusable bounded integer schema for string-backed values. */
export function stringAsInteger(options: {
	defaultValue?: number;
	maximum?: number;
	minimum?: number;
}) {
	let schema = z.coerce.number().int();
	if (options.minimum !== undefined) schema = schema.min(options.minimum);
	if (options.maximum !== undefined) schema = schema.max(options.maximum);

	return options.defaultValue === undefined
		? schema
		: z.preprocess((value) => value ?? options.defaultValue, schema);
}

/** Converts a conventional `true` or `false` string to a boolean. */
export const stringAsBoolean = z
	.enum(["true", "false"])
	.transform((value) => value === "true");
