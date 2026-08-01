/** Returns whole seconds remaining until the server-authoritative deadline. */
export function getRemainingSeconds(
	deadlineAt: string | null,
	now = Date.now(),
): number | null {
	if (!deadlineAt) return null;
	const deadline = new Date(deadlineAt).getTime();
	if (!Number.isFinite(deadline)) return null;
	return Math.max(0, Math.ceil((deadline - now) / 1_000));
}

/** Formats a countdown as hours when required and otherwise MM:SS. */
export function formatCountdown(seconds: number | null): string {
	if (seconds === null) return "--:--";
	const hours = Math.floor(seconds / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	const remainder = seconds % 60;
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
		: `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
