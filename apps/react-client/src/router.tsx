import { createRouter } from "@tanstack/react-router";
import { queryClient } from "@/shared/api/query-client";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
	context: { queryClient },
	defaultPreload: "intent",
	defaultPreloadStaleTime: 0,
	routeTree,
	scrollRestoration: true,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
