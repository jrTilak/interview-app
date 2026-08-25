export const SPEECH_TO_TEXT = Symbol("SPEECH_TO_TEXT");

export type TranscribeAudioInput = {
	bytes: Uint8Array;
	mimeType: string;
	sampleRateHz?: number;
	channels?: number;
	signal?: AbortSignal;
};

export interface SpeechToTextPort {
	transcribe(input: TranscribeAudioInput): Promise<string>;
}
