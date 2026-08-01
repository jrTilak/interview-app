import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { clearUserScopedCache, queryClient } from "@/shared/api/query-client";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { AUTH_REJECTED_EVENT } from "@/shared/auth/session-events";

type QueryProviderProps = { children: ReactNode };

/** Provides memory-only server state and clears it after auth rejection. */
export function QueryProvider({ children }: QueryProviderProps) {
	useEffect(() => {
		function handleAuthRejected() {
			clearUserScopedCache();
			queryClient.setQueryData(QUERY_KEYS.auth.session(), null);
		}

		window.addEventListener(AUTH_REJECTED_EVENT, handleAuthRejected);
		return () =>
			window.removeEventListener(AUTH_REJECTED_EVENT, handleAuthRejected);
	}, []);

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}
