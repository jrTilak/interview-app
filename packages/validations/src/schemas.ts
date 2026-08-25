import z from "zod";
import {
	DESCRIPTION_LENGTH,
	EMAIL_LENGTH,
	NAME_LENGTH,
	PASSWORD_LENGTH,
	TITLE_LENGTH,
} from "./lengths.js";

export const NameSchema = z
	.string()
	.trim()
	.min(
		NAME_LENGTH.min,
		`Name must contain at least ${NAME_LENGTH.min} characters.`,
	)
	.max(NAME_LENGTH.max, `Name cannot exceed ${NAME_LENGTH.max} characters.`);

export const EmailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(EMAIL_LENGTH.min, "Enter a valid email address.")
	.max(EMAIL_LENGTH.max, `Email cannot exceed ${EMAIL_LENGTH.max} characters.`)
	.pipe(z.email("Enter a valid email address."));

export const PasswordSchema = z
	.string()
	.min(
		PASSWORD_LENGTH.min,
		`Password must contain at least ${PASSWORD_LENGTH.min} characters.`,
	)
	.max(
		PASSWORD_LENGTH.max,
		`Password cannot exceed ${PASSWORD_LENGTH.max} characters.`,
	);

export const TitleSchema = z
	.string()
	.trim()
	.min(
		TITLE_LENGTH.min,
		`Title must contain at least ${TITLE_LENGTH.min} characters.`,
	)
	.max(TITLE_LENGTH.max, `Title cannot exceed ${TITLE_LENGTH.max} characters.`);

export const DescriptionSchema = z
	.string()
	.trim()
	.min(
		DESCRIPTION_LENGTH.min,
		`Description must contain at least ${DESCRIPTION_LENGTH.min} character.`,
	)
	.max(
		DESCRIPTION_LENGTH.max,
		`Description cannot exceed ${DESCRIPTION_LENGTH.max.toLocaleString("en-US")} characters.`,
	);

export const UuidSchema = z.uuid("Must be a valid UUID.");
export const UrlSchema = z.url("Must be a valid URL.");
export const DateTimeSchema = z.iso.datetime({ offset: true });
