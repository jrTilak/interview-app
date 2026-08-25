import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import z from "zod";
import { AiHttpService } from "#/modules/ai/ai-http.service.js";
import {
	normalizeAudioMimeType,
	TRANSCRIPTION_AUDIO_MIME_TYPES,
} from "#/modules/ai/audio-formats.js";
import type { AppConfigService } from "#/types/index.js";
import type { SpeechToTextPort, TranscribeAudioInput } from "./stt.port.js";

@Injectable()
export class LocalSpeechToTextAdapter implements SpeechToTextPort {
	private static readonly _NAME = "Local STT";
	private static readonly _RESPONSE_MIME_TYPE = "application/json";
	private static readonly _MAX_RESPONSE_BYTES = 128 * 1024;
	private static readonly _MIN_PCM_SAMPLE_RATE_HZ = 8_000;
	private static readonly _MAX_PCM_SAMPLE_RATE_HZ = 192_000;
	private static readonly _TRANSCRIPT_SCHEMA = z
		.object({ text: z.string().trim() })
		.strict();

	constructor(
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
		@Inject(AiHttpService)
		private readonly _http: AiHttpService,
	) {}

	/** Uploads one bounded candidate turn to the configured speech service. */
	async transcribe(input: TranscribeAudioInput): Promise<string> {
		const mimeType = this._validateInput(
			input,
			this._config.get("AUDIO_MAX_BYTES", { infer: true }),
		);
		const response = await this._http.post({
			name: LocalSpeechToTextAdapter._NAME,
			url: new URL(
				"/transcribe",
				this._config.get("LOCAL_STT_URL", { infer: true }),
			),
			body: this._createAudioForm(input, mimeType),
			headers: { Accept: LocalSpeechToTextAdapter._RESPONSE_MIME_TYPE },
			timeoutMs: this._config.get("LOCAL_STT_TIMEOUT_MS", { infer: true }),
			signal: input.signal,
			expectedMimeType: LocalSpeechToTextAdapter._RESPONSE_MIME_TYPE,
			responseType: "response type",
			maximumBytes: LocalSpeechToTextAdapter._MAX_RESPONSE_BYTES,
			limitMessage: `transcript exceeds the ${LocalSpeechToTextAdapter._MAX_RESPONSE_BYTES}-byte response limit`,
		});
		return this._parseTranscript(response.bytes);
	}

	private _createAudioForm(
		input: TranscribeAudioInput,
		mimeType: string,
	): FormData {
		const form = new FormData();
		const audioBytes = new Uint8Array(input.bytes.byteLength);
		audioBytes.set(input.bytes);
		form.append(
			"audio",
			new Blob([audioBytes.buffer], { type: mimeType }),
			mimeType === "audio/l16" ? "candidate.pcm" : "candidate.wav",
		);
		if (input.sampleRateHz !== undefined) {
			form.append("sample_rate_hz", String(input.sampleRateHz));
		}
		if (input.channels !== undefined) {
			form.append("channels", String(input.channels));
		}
		return form;
	}

	private _validateInput(
		input: TranscribeAudioInput,
		maximumBytes: number,
	): string {
		const mimeType = normalizeAudioMimeType(input.mimeType);
		if (!TRANSCRIPTION_AUDIO_MIME_TYPES.has(mimeType)) {
			throw this._http.error(
				LocalSpeechToTextAdapter._NAME,
				`does not support transcription audio type: ${mimeType || "missing"}`,
			);
		}
		if (input.bytes.byteLength === 0) {
			throw this._http.error(
				LocalSpeechToTextAdapter._NAME,
				"audio must not be empty",
			);
		}
		if (input.bytes.byteLength > maximumBytes) {
			throw this._http.error(
				LocalSpeechToTextAdapter._NAME,
				`audio exceeds the ${maximumBytes}-byte request limit`,
			);
		}
		if (mimeType !== "audio/l16") return mimeType;

		const sampleRateHz = input.sampleRateHz;
		const channels = input.channels;
		if (
			sampleRateHz === undefined ||
			!Number.isInteger(sampleRateHz) ||
			sampleRateHz < LocalSpeechToTextAdapter._MIN_PCM_SAMPLE_RATE_HZ ||
			sampleRateHz > LocalSpeechToTextAdapter._MAX_PCM_SAMPLE_RATE_HZ
		) {
			throw this._http.error(
				LocalSpeechToTextAdapter._NAME,
				"raw PCM requires a sample rate from 8000 to 192000 Hz",
			);
		}
		if (
			channels === undefined ||
			!Number.isInteger(channels) ||
			channels < 1 ||
			channels > 2
		) {
			throw this._http.error(
				LocalSpeechToTextAdapter._NAME,
				"raw PCM requires one or two channels",
			);
		}
		if (input.bytes.byteLength % (channels * 2) !== 0) {
			throw this._http.error(
				LocalSpeechToTextAdapter._NAME,
				"raw PCM must contain complete 16-bit audio frames",
			);
		}
		return mimeType;
	}

	private _parseTranscript(bytes: Buffer): string {
		const parsed = LocalSpeechToTextAdapter._TRANSCRIPT_SCHEMA.safeParse(
			this._http.parseJson(LocalSpeechToTextAdapter._NAME, bytes),
		);
		if (!parsed.success) {
			throw this._http.error(
				LocalSpeechToTextAdapter._NAME,
				"returned an invalid transcript payload",
				parsed.error,
			);
		}
		return parsed.data.text;
	}
}
