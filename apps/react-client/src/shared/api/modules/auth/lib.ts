import {
	getSession,
	signInEmail,
	signOut as signOutRequest,
	signUpWithEmailAndPassword,
} from "@/shared/api/generated/authentication";

export type GetSessionOutput = Awaited<ReturnType<typeof getSession>>;
export type AuthSession = GetSessionOutput;
export { getSession };

export type SignInInput = Parameters<typeof signInEmail>[0];

/** Authenticates an email/password account and then retrieves its session. */
export async function signIn(input: SignInInput) {
	await signInEmail(input);
	return getSession();
}
export type SignInOutput = Awaited<ReturnType<typeof signIn>>;

export type SignUpInput = NonNullable<
	Parameters<typeof signUpWithEmailAndPassword>[0]
>;

/** Creates a deliberately minimal email/password account. */
export async function signUp(input: SignUpInput) {
	await signUpWithEmailAndPassword(input);
	return getSession();
}
export type SignUpOutput = Awaited<ReturnType<typeof signUp>>;

/** Revokes the current cookie session. */
export async function signOut(): Promise<void> {
	await signOutRequest();
}
export type SignOutOutput = Awaited<ReturnType<typeof signOut>>;
