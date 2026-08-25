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
import { useSignIn } from "@/shared/api/modules/auth/hooks";
import { getSafeAuthRedirect } from "@/shared/auth/safe-redirect";
import { firstFormError, parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";
import { LoginSchema } from "./login.validation";

/** Authenticates one email/password account and restores its deep link. */
export function LoginForm({ redirect }: { redirect?: string }) {
	const login = useSignIn();
	const router = useRouter();
	const form = useForm({
		defaultValues: { email: "", password: "" },
		validators: { onSubmit: LoginSchema },
		async onSubmit({ value }) {
			try {
				const credentials = LoginSchema.parse(value);
				const session = await login.mutateAsync({
					...credentials,
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
					description: parseError(error, "Unable to sign in."),
					title: "Sign in failed",
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
				<form.Field name="email">
					{(field) => (
						<FieldShell
							error={firstFormError(field.state.meta.errors)}
							label="Email"
							required
						>
							<Input
								autoComplete="email"
								autoFocus
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
								autoComplete="current-password"
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
							disabled={!canSubmit || login.isPending}
							loading={isSubmitting || login.isPending}
							size="xl"
							type="submit"
						>
							Sign in
							<ArrowRight aria-hidden="true" size={17} />
						</Button>
					)}
				</form.Subscribe>
			</Stack>
			<Text color="muted" fontSize="sm" mt="6">
				New here?{" "}
				<ChakraLink asChild color="cobalt" fontWeight="700">
					<Link search={{ redirect }} to="/signup">
						Create an account
					</Link>
				</ChakraLink>
			</Text>
		</form>
	);
}
