import { z } from "zod";

export const LoginSchema = z.object({
	email: z.string().trim().toLowerCase().email("Enter a valid email address."),
	password: z
		.string()
		.min(8, "Password must contain at least 8 characters.")
		.max(128, "Password cannot exceed 128 characters."),
});

export type LoginValues = z.infer<typeof LoginSchema>;
