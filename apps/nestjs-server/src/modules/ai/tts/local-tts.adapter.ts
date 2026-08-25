import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiHttpService } from "#src/modules/ai/ai-http.service.js";
import type { AppConfigService } from "#src/types/index.js";
import type {
	SpeechChunk,
	SynthesizeSpeechInput,
	TextToSpeechPort,
} from "./tts.port.js";

/** Audio metadata read from a validated PCM WAV response. */
type WaveMetadata = {
	sampleRateHz: number;
	channels: number;
	bitsPerSample: number;
};

@Injectable()
export class LocalTextToSpeechAdapter implements TextToSpeechPort {
	private readonly _name = "Local TTS";
	private readonly _mimeType = "audio/wav";
	private readonly _sampleRateHz = 24_000;
	private readonly _channels = 1;
	private readonly _bitsPerSample = 16;
	private readonly _pcmFormat = 1;
	private readonly _maximumAudioBytes = 20 * 1024 * 1024;
	private readonly _maximumTextCharacters = 4_000;

	constructor(
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
		@Inject(AiHttpService)
		private readonly _http: AiHttpService,
	) {}

	/** Synthesizes and validates one complete provider WAV response. */
	async synthesize(input: SynthesizeSpeechInput): Promise<SpeechChunk> {
		this._validateInput(input);
		const voice =
			input.voice ?? this._config.get("LOCAL_TTS_VOICE", { infer: true });
		const response = await this._http.post({
			name: this._name,
			url: new URL(
				"/synthesize",
				this._config.get("LOCAL_TTS_URL", { infer: true }),
			),
			body: JSON.stringify({ text: input.text, voice }),
			headers: {
				Accept: this._mimeType,
				"Content-Type": "application/json",
			},
			timeoutMs: this._config.get("LOCAL_TTS_TIMEOUT_MS", { infer: true }),
			signal: input.signal,
			expectedMimeType: this._mimeType,
			responseType: "audio type",
			maximumBytes: this._maximumAudioBytes,
			limitMessage: `audio exceeds the ${this._maximumAudioBytes}-byte response limit`,
		});

		const metadata = this._validateWave(response.bytes);
		this._assertMetadataHeader(
			response.headers,
			"X-Sample-Rate",
			metadata.sampleRateHz,
		);
		this._assertMetadataHeader(
			response.headers,
			"X-Channels",
			metadata.channels,
		);
		this._assertMetadataHeader(
			response.headers,
			"X-Bit-Depth",
			metadata.bitsPerSample,
		);

		return {
			bytes: response.bytes,
			channels: metadata.channels,
			mimeType: this._mimeType,
			sampleRateHz: metadata.sampleRateHz,
		};
	}

	private _validateInput(input: SynthesizeSpeechInput): void {
		if (!input.text.trim()) {
			throw this._http.error(this._name, "text must not be empty");
		}
		if (input.text.length > this._maximumTextCharacters) {
			throw this._http.error(
				this._name,
				`text exceeds ${this._maximumTextCharacters} characters`,
			);
		}
	}

	private _readChunkId(bytes: Buffer, offset: number): string {
		return bytes.toString("ascii", offset, offset + 4);
	}

	/** Verifies the complete WAV container before audio leaves the adapter. */
	private _validateWave(bytes: Buffer): WaveMetadata {
		if (bytes.byteLength < 12) {
			throw this._http.error(
				this._name,
				"returned empty or malformed WAV audio",
			);
		}
		if (
			this._readChunkId(bytes, 0) !== "RIFF" ||
			this._readChunkId(bytes, 8) !== "WAVE"
		) {
			throw this._http.error(this._name, "returned malformed RIFF/WAVE audio");
		}
		if (bytes.readUInt32LE(4) !== bytes.byteLength - 8) {
			throw this._http.error(this._name, "returned a malformed RIFF size");
		}

		let format: WaveMetadata | undefined;
		let blockAlign: number | undefined;
		let dataBytes: number | undefined;
		let offset = 12;
		while (offset < bytes.byteLength) {
			if (offset + 8 > bytes.byteLength) {
				throw this._http.error(this._name, "returned a truncated WAV chunk");
			}
			const chunkId = this._readChunkId(bytes, offset);
			const chunkSize = bytes.readUInt32LE(offset + 4);
			const chunkStart = offset + 8;
			const chunkEnd = chunkStart + chunkSize;
			const nextOffset = chunkEnd + (chunkSize % 2);
			if (chunkEnd > bytes.byteLength || nextOffset > bytes.byteLength) {
				throw this._http.error(this._name, "returned a truncated WAV chunk");
			}

			if (chunkId === "fmt ") {
				if (format || chunkSize < 16) {
					throw this._http.error(
						this._name,
						"returned a malformed WAV format chunk",
					);
				}
				const audioFormat = bytes.readUInt16LE(chunkStart);
				const channels = bytes.readUInt16LE(chunkStart + 2);
				const sampleRateHz = bytes.readUInt32LE(chunkStart + 4);
				const byteRate = bytes.readUInt32LE(chunkStart + 8);
				blockAlign = bytes.readUInt16LE(chunkStart + 12);
				const bitsPerSample = bytes.readUInt16LE(chunkStart + 14);
				if (audioFormat !== this._pcmFormat) {
					throw this._http.error(
						this._name,
						"WAV must use integer PCM encoding",
					);
				}
				const expectedBlockAlign = (channels * bitsPerSample) / 8;
				if (
					!Number.isInteger(expectedBlockAlign) ||
					blockAlign !== expectedBlockAlign ||
					byteRate !== sampleRateHz * expectedBlockAlign
				) {
					throw this._http.error(
						this._name,
						"returned inconsistent WAV metadata",
					);
				}
				format = { bitsPerSample, channels, sampleRateHz };
			} else if (chunkId === "data") {
				if (dataBytes !== undefined) {
					throw this._http.error(
						this._name,
						"returned multiple WAV data chunks",
					);
				}
				dataBytes = chunkSize;
			}

			offset = nextOffset;
		}

		if (!format || blockAlign === undefined || dataBytes === undefined) {
			throw this._http.error(this._name, "returned incomplete WAV audio");
		}
		if (dataBytes === 0 || dataBytes % blockAlign !== 0) {
			throw this._http.error(
				this._name,
				"WAV must contain complete, non-empty audio frames",
			);
		}
		if (
			format.channels !== this._channels ||
			format.sampleRateHz !== this._sampleRateHz ||
			format.bitsPerSample !== this._bitsPerSample
		) {
			throw this._http.error(
				this._name,
				"WAV must be mono 24000 Hz 16-bit PCM",
			);
		}
		return format;
	}

	private _assertMetadataHeader(
		headers: Headers,
		name: string,
		expected: number,
	): void {
		const rawValue = headers.get(name);
		if (rawValue === null) return;
		const normalized = rawValue.trim();
		if (!/^\d+$/.test(normalized) || Number(normalized) !== expected) {
			throw this._http.error(
				this._name,
				`${name} header conflicts with WAV metadata`,
			);
		}
	}
}
