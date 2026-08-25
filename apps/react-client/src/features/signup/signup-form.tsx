import {
	Button,
	Link as ChakraLink,
	Input,
	Stack,
	Text,
} from "@chakra-ui/react";
import { useForm } from "@tanstack/react-form";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { FieldShell } from "@/components/atoms/form-field";
import { useSignUp } from "@/shared/api/modules/auth/hooks";
import { getSafeAuthRedirect } from "@/shared/auth/safe-redirect";
import { firstFormError, parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";
import { SignupSchema } from "./signup.validation";

/** Creates a minimal account whose name is used by the AI interviewer. */
export function SignupForm({ redirect }: { redirect?: string }) {
	const signup = useSignUp();
	const router = useRouter();
	const form = useForm({
		defaultValues: { email: "", name: "", password: "" },
		validators: { onSubmit: SignupSchema },
		async onSubmit({ value }) {
			try {
				const account = SignupSchema.parse(value);
				const session = await signup.mutateAsync({
					...account,
					rememberMe: true,
				});
				if (!session) throw new Error("The session could not be created.");
				await router.invalidate();
				await router.navigate({
					href: getSafeAuthRedirect(redirect),
					replace: true,
				});
			} catch (error) {
				toaster.error({
					description: parseError(error, "Unable to create your account."),
					title: "Account creation failed",
				});
			}
		},
	});

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<Stack gap="5">
				<form.Field name="name">
					{(field) => (
						<FieldShell
							error={firstFormError(field.state.meta.errors)}
							hint="The interviewer uses this name when greeting you."
							label="Full name"
							required
						>
							<Input
								autoComplete="name"
								autoFocus
								name={field.name}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="Ada Lovelace"
								size="xl"
								value={field.state.value}
							/>
						</FieldShell>
					)}
				</form.Field>
				<form.Field name="email">
					{(field) => (
						<FieldShell
							error={firstFormError(field.state.meta.errors)}
							label="Email"
							required
						>
							<Input
								autoComplete="email"
								name={field.name}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="you@example.com"
								size="xl"
								type="email"
								value={field.state.value}
							/>
						</FieldShell>
					)}
				</form.Field>
				<form.Field name="password">
					{(field) => (
						<FieldShell
							error={firstFormError(field.state.meta.errors)}
							label="Password"
							required
						>
							<Input
								autoComplete="new-password"
								name={field.name}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="At least 8 characters"
								size="xl"
								type="password"
								value={field.state.value}
							/>
						</FieldShell>
					)}
				</form.Field>
				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting]}
				>
					{([canSubmit, isSubmitting]) => (
						<Button
							disabled={!canSubmit || signup.isPending}
							loading={isSubmitting || signup.isPending}
							size="xl"
							type="submit"
						>
							Create account
							<ArrowRight aria-hidden="true" size={17} />
						</Button>
					)}
				</form.Subscribe>
			</Stack>
			<Text color="muted" fontSize="sm" mt="6">
				Already registered?{" "}
				<ChakraLink asChild color="cobalt" fontWeight="700">
					<Link search={{ redirect }} to="/login">
						Sign in
					</Link>
				</ChakraLink>
			</Text>
		</form>
	);
}
