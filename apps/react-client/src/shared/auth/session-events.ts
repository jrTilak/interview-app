export const AUTH_REJECTED_EVENT = "interview-desk:auth-rejected";

/** Notifies the application that the server authoritatively rejected a cookie. */
export function publishAuthRejected(): void {
	window.dispatchEvent(new Event(AUTH_REJECTED_EVENT));
}
