/** Dependency-injection token for the configured speech synthesizer. */
export const TEXT_TO_SPEECH = Symbol("TEXT_TO_SPEECH");

/** One utterance requested from a text-to-speech provider. */
export type SynthesizeSpeechInput = {
	text: string;
	voice?: string;
	/** Cancels the provider request when the interview turn is no longer active. */
	signal?: AbortSignal;
};

/** One complete audio response ready to send to the candidate. */
export type SpeechChunk = {
	bytes: Uint8Array;
	mimeType: string;
	sampleRateHz?: number;
	channels?: number;
};

/** Provider-neutral text-to-speech boundary used by interview orchestration. */
export interface TextToSpeechPort {
	synthesize(input: SynthesizeSpeechInput): Promise<SpeechChunk>;
}
