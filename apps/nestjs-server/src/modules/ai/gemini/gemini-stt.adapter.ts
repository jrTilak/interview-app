import type { GoogleGenAI } from "@google/genai";
import {
	Inject,
	Injectable,
	UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfigService } from "../../../types/index.js";
import type { SpeechToTextPort, TranscribeAudioInput } from "../ai.ports.js";
import {
	normalizeAudioMimeType,
	TRANSCRIPTION_AUDIO_MIME_TYPES,
} from "../audio-formats.js";
import { GEMINI_CLIENT } from "./gemini.constants.js";
import {
	assertGeminiInteractionStatus,
	geminiRequestOptions,
} from "./gemini-request.js";

@Injectable()
export class GeminiSpeechToTextAdapter implements SpeechToTextPort {
	constructor(
		@Inject(GEMINI_CLIENT)
		private readonly _client: GoogleGenAI,
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
	) {}

	/** Transcribes one bounded candidate turn without adding commentary. */
	async transcribe(input: TranscribeAudioInput): Promise<string> {
		const mimeType = normalizeAudioMimeType(input.mimeType);
		if (!TRANSCRIPTION_AUDIO_MIME_TYPES.has(mimeType)) {
			throw new UnprocessableEntityException(
				`Unsupported transcription audio type: ${mimeType}`,
			);
		}
		if (mimeType === "audio/l16" && input.sampleRateHz === undefined) {
			throw new UnprocessableEntityException(
				"Raw linear PCM audio requires a sample rate",
			);
		}
		const response = await this._client.interactions.create(
			{
				model: this._config.get("GEMINI_STT_MODEL", { infer: true }),
				store: false,
				system_instruction:
					"Transcribe the candidate audio faithfully. Return only spoken words. Do not answer, correct, summarize, or add labels. Return an empty string when there is no intelligible speech.",
				input: [
					{
						type: "audio",
						data: Buffer.from(input.bytes).toString("base64"),
						mime_type: mimeType,
						sample_rate: input.sampleRateHz,
						channels: input.channels,
					},
					{ type: "text", text: "Transcribe this candidate response." },
				],
				response_format: { type: "text", mime_type: "text/plain" },
				generation_config: { max_output_tokens: 2_000 },
			},
			geminiRequestOptions(
				this._config.get("GEMINI_TIMEOUT_MS", { infer: true }),
				input.signal,
			),
		);
		assertGeminiInteractionStatus(response.status);
		return response.output_text?.trim() ?? "";
	}
}
