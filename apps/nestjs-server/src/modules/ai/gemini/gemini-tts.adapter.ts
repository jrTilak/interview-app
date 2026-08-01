import type { GoogleGenAI } from "@google/genai";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfigService } from "../../../types/index.js";
import type {
	SpeechChunk,
	SynthesizeSpeechInput,
	TextToSpeechPort,
} from "../ai.ports.js";
import { normalizeAudioMimeType } from "../audio-formats.js";
import { GEMINI_CLIENT } from "./gemini.constants.js";

const GEMINI_PCM_MIME_TYPE = "audio/l16";
const GEMINI_PCM_SAMPLE_RATE_HZ = 24_000;
const GEMINI_PCM_CHANNELS = 1;

@Injectable()
export class GeminiTextToSpeechAdapter implements TextToSpeechPort {
	constructor(
		@Inject(GEMINI_CLIENT)
		private readonly _client: GoogleGenAI,
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
	) {}

	/** Fetches and returns one complete Gemini raw PCM utterance. */
	async synthesize(input: SynthesizeSpeechInput): Promise<SpeechChunk> {
		const voice =
			input.voice ?? this._config.get("GEMINI_TTS_VOICE", { infer: true });
		const timeoutMs = this._config.get("GEMINI_TIMEOUT_MS", { infer: true });
		const timeoutSignal = AbortSignal.timeout(timeoutMs);
		const abortSignal = input.signal
			? AbortSignal.any([input.signal, timeoutSignal])
			: timeoutSignal;
		const response = await this._client.models.generateContent({
			model: this._config.get("GEMINI_TTS_MODEL", { infer: true }),
			contents: [
				{
					parts: [
						{
							text: [
								"Speak the following interviewer transcript naturally and professionally.",
								"Do not read these directions or add any words.",
								"TRANSCRIPT:",
								input.text,
							].join("\n"),
						},
					],
				},
			],
			config: {
				abortSignal,
				httpOptions: {
					timeout: timeoutMs,
					retryOptions: { attempts: 2 },
				},
				responseModalities: ["AUDIO"],
				speechConfig: {
					voiceConfig: {
						prebuiltVoiceConfig: { voiceName: voice },
					},
				},
			},
		});

		const inlineData = response.candidates?.[0]?.content?.parts?.find(
			(part) => part.inlineData?.data,
		)?.inlineData;
		if (!inlineData?.data) {
			throw new Error("Gemini TTS returned no completed audio");
		}
		const mimeType = inlineData.mimeType ?? GEMINI_PCM_MIME_TYPE;
		if (normalizeAudioMimeType(mimeType) !== GEMINI_PCM_MIME_TYPE) {
			throw new Error(
				`Gemini TTS returned unsupported audio type: ${mimeType}`,
			);
		}
		const bytes = Buffer.from(inlineData.data, "base64");
		if (bytes.byteLength === 0 || bytes.byteLength % 2 !== 0) {
			throw new Error("Gemini TTS returned invalid PCM audio");
		}
		return {
			bytes,
			mimeType,
			sampleRateHz: GEMINI_PCM_SAMPLE_RATE_HZ,
			channels: GEMINI_PCM_CHANNELS,
		};
	}
}
