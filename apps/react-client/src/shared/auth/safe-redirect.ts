const DEFAULT_AUTH_REDIRECT = "/dashboard";

/** Keeps post-auth navigation on this origin and falls back to the dashboard. */
export function getSafeAuthRedirect(
	candidate: string | undefined,
	origin = window.location.origin,
): string {
	if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
		return DEFAULT_AUTH_REDIRECT;
	}
	try {
		const url = new URL(candidate, origin);
		if (url.origin !== origin) return DEFAULT_AUTH_REDIRECT;
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return DEFAULT_AUTH_REDIRECT;
	}
}
