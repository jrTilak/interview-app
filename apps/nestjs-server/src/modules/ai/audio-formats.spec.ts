import {
	normalizeAudioMimeType,
	TRANSCRIPTION_AUDIO_MIME_TYPES,
} from "./audio-formats.js";

describe("transcription audio formats", () => {
	it("contains exactly the formats supported by the local STT provider", () => {
		expect([...TRANSCRIPTION_AUDIO_MIME_TYPES]).toEqual([
			"audio/wav",
			"audio/wave",
			"audio/x-wav",
			"audio/l16",
		]);
	});

	it.each([
		[" Audio/X-WAV; codecs=pcm ", "audio/x-wav"],
		["audio/L16;rate=16000;channels=1", "audio/l16"],
		["audio/wave", "audio/wave"],
		["  ", ""],
	])("normalizes %j", (input, expected) => {
		expect(normalizeAudioMimeType(input)).toBe(expected);
	});
});
