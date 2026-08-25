/** Audio formats accepted end to end by the local transcription provider. */
export const TRANSCRIPTION_AUDIO_MIME_TYPES: ReadonlySet<string> = new Set([
	"audio/wav",
	"audio/wave",
	"audio/x-wav",
	"audio/l16",
]);

/** Removes optional parameters and normalizes MIME values for comparison. */
export function normalizeAudioMimeType(value: string): string {
	return (value.split(";", 1)[0] ?? "").trim().toLowerCase();
}
