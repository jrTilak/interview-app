import { createFileRoute } from "@tanstack/react-router";
import { JoinByLinkScreen } from "@/features/join-by-link";

export const Route = createFileRoute("/_authenticated/join")({
	component: JoinByLinkScreen,
});
