import {
	type GetSession200,
	getBetterAuth,
	type SignInEmailBody,
	type SignUpWithEmailAndPasswordBody,
} from "@/shared/api/generated/authentication";

const authApi = getBetterAuth();

export type AuthSession = GetSession200;

/** Retrieves the server-authoritative cookie session. */
export function getSession(): Promise<GetSession200> {
	return authApi.getSession();
}

/** Authenticates an email/password account and then retrieves its session. */
export async function signIn(input: SignInEmailBody): Promise<GetSession200> {
	await authApi.signInEmail(input);
	return getSession();
}

/** Creates a deliberately minimal email/password account. */
export async function signUp(
	input: SignUpWithEmailAndPasswordBody,
): Promise<GetSession200> {
	await authApi.signUpWithEmailAndPassword(input);
	return getSession();
}

/** Revokes the current cookie session. */
export async function signOut(): Promise<void> {
	await authApi.signOut({});
}
