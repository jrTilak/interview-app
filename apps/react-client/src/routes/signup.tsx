import { createFileRoute, redirect } from "@tanstack/react-router";
import { SignupScreen } from "@/features/signup";
import { sessionQueryOptions } from "@/shared/api/modules/auth/queries";

export const Route = createFileRoute("/signup")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(
			sessionQueryOptions(),
		);
		if (session) throw redirect({ to: "/dashboard" });
	},
	component: SignupRoute,
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
});

function SignupRoute() {
	const { redirect: target } = Route.useSearch();
	return <SignupScreen redirect={target} />;
}
