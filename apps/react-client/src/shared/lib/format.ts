const dateFormatter = new Intl.DateTimeFormat(undefined, {
	day: "2-digit",
	month: "short",
	year: "numeric",
});

/** Formats a server timestamp for compact desktop metadata. */
export function formatDate(value: string): string {
	return dateFormatter.format(new Date(value));
}

/** Formats a whole-minute interview duration. */
export function formatDuration(minutes: number): string {
	return `${minutes} min`;
}
