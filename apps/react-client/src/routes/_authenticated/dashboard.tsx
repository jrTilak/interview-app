import { createFileRoute } from "@tanstack/react-router";
import { DashboardScreen } from "@/features/dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
	component: DashboardScreen,
});
