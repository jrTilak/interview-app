import { AuthLayout } from "@/components/layouts/auth-layout";
import { LoginForm } from "./login-form";

/** Renders the deliberately narrow email login screen. */
export function LoginScreen({ redirect }: { redirect?: string }) {
	return (
		<AuthLayout title="Welcome back.">
			<LoginForm redirect={redirect} />
		</AuthLayout>
	);
}
