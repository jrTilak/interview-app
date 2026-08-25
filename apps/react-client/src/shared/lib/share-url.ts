/** Builds the public candidate route on the origin currently serving the PWA. */
export function getInterviewShareUrl(interviewId: string): string {
	return new URL(
		`/interviews/${interviewId}`,
		window.location.origin,
	).toString();
}
