export const TEXT_TO_SPEECH = Symbol("TEXT_TO_SPEECH");

export type SynthesizeSpeechInput = {
	text: string;
	voice?: string;
	signal?: AbortSignal;
};

export type SpeechChunk = {
	bytes: Uint8Array;
	mimeType: string;
	sampleRateHz?: number;
	channels?: number;
};

export interface TextToSpeechPort {
	synthesize(input: SynthesizeSpeechInput): Promise<SpeechChunk>;
}
