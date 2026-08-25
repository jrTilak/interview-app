import { Field } from "@chakra-ui/react";
import type { ReactNode } from "react";

type FieldShellProps = {
	children: ReactNode;
	error?: string | null;
	hint?: string;
	label: string;
	required?: boolean;
};

/** Applies consistent labels, hints, and validation messages to form controls. */
export function FieldShell({
	children,
	error,
	hint,
	label,
	required,
}: FieldShellProps) {
	return (
		<Field.Root invalid={Boolean(error)} required={required}>
			<Field.Label>
				{label}
				{required && <Field.RequiredIndicator />}
			</Field.Label>
			{children}
			{hint && !error && <Field.HelperText>{hint}</Field.HelperText>}
			{error && <Field.ErrorText>{error}</Field.ErrorText>}
		</Field.Root>
	);
}
