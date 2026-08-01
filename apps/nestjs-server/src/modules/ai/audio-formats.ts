export const TRANSCRIPTION_AUDIO_MIME_TYPES = new Set([
	"audio/wav",
	"audio/mpeg",
	"audio/mp3",
	"audio/aiff",
	"audio/aac",
	"audio/ogg",
	"audio/flac",
	"audio/m4a",
	"audio/l16",
]);

/** Normalizes transport MIME values before provider-neutral validation. */
export function normalizeAudioMimeType(value: string): string {
	return (value.split(";", 1)[0] ?? "").trim().toLowerCase();
}
