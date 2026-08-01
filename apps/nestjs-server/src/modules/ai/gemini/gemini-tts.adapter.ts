import type { GoogleGenAI } from "@google/genai";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfigService } from "../../../types/index.js";
import type {
	SpeechChunk,
	SynthesizeSpeechInput,
	TextToSpeechPort,
} from "../ai.ports.js";
import { GEMINI_CLIENT } from "./gemini.constants.js";
import { geminiRequestOptions } from "./gemini-request.js";

@Injectable()
export class GeminiTextToSpeechAdapter implements TextToSpeechPort {
	constructor(
		@Inject(GEMINI_CLIENT)
		private readonly _client: GoogleGenAI,
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
	) {}

	/** Streams Gemini's interviewer speech chunks in their declared audio format. */
	async *synthesize(input: SynthesizeSpeechInput): AsyncIterable<SpeechChunk> {
		const voice =
			input.voice ?? this._config.get("GEMINI_TTS_VOICE", { infer: true });
		const stream = await this._client.interactions.create(
			{
				model: this._config.get("GEMINI_TTS_MODEL", { infer: true }),
				store: false,
				stream: true,
				input: [
					{
						type: "text",
						text: [
							"Speak the following interviewer transcript naturally and professionally.",
							"Do not read these directions or add any words.",
							"TRANSCRIPT:",
							input.text,
						].join("\n"),
					},
				],
				response_format: {
					type: "audio",
					mime_type: "audio/l16",
					sample_rate: 24_000,
					delivery: "inline",
				},
				generation_config: {
					speech_config: [{ voice }],
				},
			},
			geminiRequestOptions(
				this._config.get("GEMINI_TIMEOUT_MS", { infer: true }),
				input.signal,
			),
		);

		let emitted = false;
		let completed = false;
		for await (const event of stream) {
			if (event.event_type === "error") {
				throw new Error(event.error?.message ?? "Gemini TTS stream failed");
			}
			if (event.event_type === "interaction.status_update") {
				if (
					["failed", "cancelled", "incomplete", "budget_exceeded"].includes(
						event.status,
					)
				) {
					throw new Error(`Gemini TTS ended with status: ${event.status}`);
				}
				continue;
			}
			if (event.event_type === "interaction.completed") {
				if (event.interaction.status !== "completed") {
					throw new Error(
						`Gemini TTS ended with status: ${event.interaction.status}`,
					);
				}
				completed = true;
				continue;
			}
			if (
				event.event_type !== "step.delta" ||
				event.delta.type !== "audio" ||
				!event.delta.data
			) {
				continue;
			}
			emitted = true;
			yield {
				bytes: Buffer.from(event.delta.data, "base64"),
				mimeType: event.delta.mime_type ?? "audio/l16",
				sampleRateHz: event.delta.sample_rate ?? 24_000,
				channels: event.delta.channels ?? 1,
			};
		}
		if (!completed || !emitted) {
			throw new Error("Gemini TTS stream ended without completed audio");
		}
	}
}
