import { Field, Input, Textarea } from "@chakra-ui/react";
import type { ComponentProps, ReactNode } from "react";

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
			<Field.Label
				color={error ? "danger" : "ink"}
				fontSize="xs"
				fontWeight="700"
				letterSpacing="0.08em"
				textTransform="uppercase"
			>
				{label}
				{required && <Field.RequiredIndicator />}
			</Field.Label>
			{children}
			{hint && !error && <Field.HelperText>{hint}</Field.HelperText>}
			{error && <Field.ErrorText>{error}</Field.ErrorText>}
		</Field.Root>
	);
}

export function TextInput(props: ComponentProps<typeof Input>) {
	return (
		<Input
			bg="surface"
			borderColor="line"
			focusRingColor="cobalt"
			h="12"
			px="4"
			{...props}
		/>
	);
}

export function TextAreaInput(props: ComponentProps<typeof Textarea>) {
	return (
		<Textarea
			bg="surface"
			borderColor="line"
			focusRingColor="cobalt"
			minH="40"
			p="4"
			resize="vertical"
			{...props}
		/>
	);
}
