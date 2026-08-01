/** Builds the public candidate route on the origin currently serving the PWA. */
export function getInterviewShareUrl(shareCode: string): string {
	return new URL(`/interviews/${shareCode}`, window.location.origin).toString();
}
