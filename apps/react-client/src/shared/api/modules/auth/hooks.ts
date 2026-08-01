import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearUserScopedCache } from "@/shared/api/query-client";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { signIn, signOut, signUp } from "./lib";

/** Creates an email login mutation that hydrates the session cache. */
export function useSignIn() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: signIn,
		onSuccess(session) {
			if (!session) throw new Error("The session could not be created.");
			cache.setQueryData(QUERY_KEYS.auth.session(), session);
		},
	});
}

/** Creates an email signup mutation that hydrates the session cache. */
export function useSignUp() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: signUp,
		onSuccess(session) {
			if (!session) throw new Error("The session could not be created.");
			cache.setQueryData(QUERY_KEYS.auth.session(), session);
		},
	});
}

/** Revokes the current session and clears only authenticated user state. */
export function useSignOut() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: signOut,
		onSuccess() {
			clearUserScopedCache();
			cache.setQueryData(QUERY_KEYS.auth.session(), null);
		},
	});
}
