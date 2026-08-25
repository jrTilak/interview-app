export const SPEECH_TO_TEXT = Symbol("SPEECH_TO_TEXT");

/** One complete candidate utterance ready for transcription. */
export type TranscribeAudioInput = {
	bytes: Uint8Array;
	mimeType: string;
	/** Required with raw `audio/l16` input. */
	sampleRateHz?: number;
	/** Required with raw `audio/l16` input. */
	channels?: number;
	signal?: AbortSignal;
};

export interface SpeechToTextPort {
	/** Returns the normalized transcript for one complete utterance. */
	transcribe(input: TranscribeAudioInput): Promise<string>;
}
