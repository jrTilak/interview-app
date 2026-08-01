import { z } from "zod";

export const SignupSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, "Name must contain at least 2 characters.")
		.max(80, "Name cannot exceed 80 characters."),
	email: z.string().trim().toLowerCase().email("Enter a valid email address."),
	password: z
		.string()
		.min(8, "Password must contain at least 8 characters.")
		.max(128, "Password cannot exceed 128 characters."),
});

export type SignupValues = z.infer<typeof SignupSchema>;
