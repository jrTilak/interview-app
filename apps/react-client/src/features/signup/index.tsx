import { AuthLayout } from "@/components/layouts/auth-layout";
import { SignupForm } from "./signup-form";

/** Renders email signup without unrelated account-management features. */
export function SignupScreen({ redirect }: { redirect?: string }) {
	return (
		<AuthLayout title="Create your account.">
			<SignupForm redirect={redirect} />
		</AuthLayout>
	);
}
