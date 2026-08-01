import { AuthLayout } from "@/components/layouts/auth-layout";
import { LoginForm } from "./login-form";

/** Renders the deliberately narrow email login screen. */
export function LoginScreen({ redirect }: { redirect?: string }) {
	return (
		<AuthLayout
			description="Use the email and password attached to your interview workspace."
			eyebrow="Account access"
			title="Welcome back."
		>
			<LoginForm redirect={redirect} />
		</AuthLayout>
	);
}
