import { createFileRoute } from "@tanstack/react-router";
import { DevFlagsScreen } from "@/features/dev-flags";

export const Route = createFileRoute("/_authenticated/__flags__")({
	component: DevFlagsScreen,
});
