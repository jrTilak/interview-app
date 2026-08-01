import { AuthLayout } from "@/components/layouts/auth-layout";
import { SignupForm } from "./signup-form";

/** Renders email signup without unrelated account-management features. */
export function SignupScreen({ redirect }: { redirect?: string }) {
	return (
		<AuthLayout
			description="Create one account to design interviews or join a shared room. No email verification is required in this project phase."
			eyebrow="New workspace"
			title="Create your account."
		>
			<SignupForm redirect={redirect} />
		</AuthLayout>
	);
}
