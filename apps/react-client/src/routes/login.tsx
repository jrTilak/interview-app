import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginScreen } from "@/features/login";
import { sessionQueryOptions } from "@/shared/api/modules/auth/queries";

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(
			sessionQueryOptions(),
		);
		if (session) throw redirect({ to: "/dashboard" });
	},
	component: LoginRoute,
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
});

function LoginRoute() {
	const { redirect: target } = Route.useSearch();
	return <LoginScreen redirect={target} />;
}
