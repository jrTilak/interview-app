const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";

export const APP_CONFIG = {
	apiBaseUrl: configuredApiUrl.replace(/\/$/, ""),
	name: "Interview Desk",
	roomNamespace: "/interviews",
} as const;

/** Resolves the Socket.IO origin for same-origin and direct-API development. */
export function getRealtimeOrigin(): string {
	return APP_CONFIG.apiBaseUrl || window.location.origin;
}
