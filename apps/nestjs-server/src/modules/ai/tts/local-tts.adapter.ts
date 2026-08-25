import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfigService } from "../../../types/index.js";
import { normalizeAudioMimeType } from "../audio-formats.js";
import type {
	SpeechChunk,
	SynthesizeSpeechInput,
	TextToSpeechPort,
} from "./tts.port.js";

const LOCAL_TTS_MIME_TYPE = "audio/wav";
const LOCAL_TTS_SAMPLE_RATE_HZ = 24_000;
const LOCAL_TTS_CHANNELS = 1;
const LOCAL_TTS_BITS_PER_SAMPLE = 16;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_HTTP_ERROR_BYTES = 4 * 1024;
const PCM_FORMAT = 1;

class LocalTextToSpeechError extends Error {}

type WaveMetadata = {
	sampleRateHz: number;
	channels: number;
	bitsPerSample: number;
};

function formatErrorCause(error: unknown): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	return "unknown network error";
}

function parseContentLength(value: string | null): number | undefined {
	if (value === null) return undefined;
	const normalized = value.trim();
	if (!/^\d+$/.test(normalized)) {
		throw new LocalTextToSpeechError(
			"Local TTS returned an invalid Content-Length header",
		);
	}
	const length = Number(normalized);
	if (!Number.isSafeInteger(length)) {
		throw new LocalTextToSpeechError(
			"Local TTS returned an invalid Content-Length header",
		);
	}
	return length;
}

async function cancelResponseBody(response: Response): Promise<void> {
	await response.body?.cancel().catch(() => undefined);
}

async function readBoundedAudio(response: Response): Promise<Buffer> {
	const contentLength = parseContentLength(
		response.headers.get("content-length"),
	);
	if (contentLength !== undefined && contentLength > MAX_AUDIO_BYTES) {
		await cancelResponseBody(response);
		throw new LocalTextToSpeechError(
			`Local TTS audio exceeds the ${MAX_AUDIO_BYTES}-byte response limit`,
		);
	}
	if (!response.body) return Buffer.alloc(0);

	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	const reader = response.body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			totalBytes += value.byteLength;
			if (totalBytes > MAX_AUDIO_BYTES) {
				await reader.cancel().catch(() => undefined);
				throw new LocalTextToSpeechError(
					`Local TTS audio exceeds the ${MAX_AUDIO_BYTES}-byte response limit`,
				);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks, totalBytes);
}

async function readHttpErrorDetail(response: Response): Promise<string> {
	if (!response.body) return "";
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	let truncated = false;
	const reader = response.body.getReader();
	try {
		while (totalBytes < MAX_HTTP_ERROR_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			const remainingBytes = MAX_HTTP_ERROR_BYTES - totalBytes;
			if (value.byteLength > remainingBytes) {
				chunks.push(value.subarray(0, remainingBytes));
				totalBytes += remainingBytes;
				truncated = true;
				await reader.cancel().catch(() => undefined);
				break;
			}
			chunks.push(value);
			totalBytes += value.byteLength;
		}
		if (totalBytes === MAX_HTTP_ERROR_BYTES && !truncated) {
			truncated = true;
			await reader.cancel().catch(() => undefined);
		}
	} finally {
		reader.releaseLock();
	}
	const detail = new TextDecoder()
		.decode(Buffer.concat(chunks, totalBytes))
		.replace(/\s+/g, " ")
		.trim();
	return detail ? `${detail}${truncated ? "…" : ""}` : "";
}

function readChunkId(bytes: Buffer, offset: number): string {
	return bytes.toString("ascii", offset, offset + 4);
}

/** Validates the local service's complete PCM16 WAV response. */
function validateWave(bytes: Buffer): WaveMetadata {
	if (bytes.byteLength < 12) {
		throw new LocalTextToSpeechError(
			"Local TTS returned empty or malformed WAV audio",
		);
	}
	if (readChunkId(bytes, 0) !== "RIFF" || readChunkId(bytes, 8) !== "WAVE") {
		throw new LocalTextToSpeechError(
			"Local TTS returned malformed RIFF/WAVE audio",
		);
	}
	if (bytes.readUInt32LE(4) !== bytes.byteLength - 8) {
		throw new LocalTextToSpeechError(
			"Local TTS returned a malformed RIFF size",
		);
	}

	let format: WaveMetadata | undefined;
	let blockAlign: number | undefined;
	let dataBytes: number | undefined;
	let offset = 12;
	while (offset < bytes.byteLength) {
		if (offset + 8 > bytes.byteLength) {
			throw new LocalTextToSpeechError(
				"Local TTS returned a truncated WAV chunk",
			);
		}
		const chunkId = readChunkId(bytes, offset);
		const chunkSize = bytes.readUInt32LE(offset + 4);
		const chunkStart = offset + 8;
		const chunkEnd = chunkStart + chunkSize;
		const nextOffset = chunkEnd + (chunkSize % 2);
		if (chunkEnd > bytes.byteLength || nextOffset > bytes.byteLength) {
			throw new LocalTextToSpeechError(
				"Local TTS returned a truncated WAV chunk",
			);
		}

		if (chunkId === "fmt ") {
			if (format || chunkSize < 16) {
				throw new LocalTextToSpeechError(
					"Local TTS returned a malformed WAV format chunk",
				);
			}
			const audioFormat = bytes.readUInt16LE(chunkStart);
			const channels = bytes.readUInt16LE(chunkStart + 2);
			const sampleRateHz = bytes.readUInt32LE(chunkStart + 4);
			const byteRate = bytes.readUInt32LE(chunkStart + 8);
			blockAlign = bytes.readUInt16LE(chunkStart + 12);
			const bitsPerSample = bytes.readUInt16LE(chunkStart + 14);
			if (audioFormat !== PCM_FORMAT) {
				throw new LocalTextToSpeechError(
					"Local TTS WAV must use integer PCM encoding",
				);
			}
			const expectedBlockAlign = (channels * bitsPerSample) / 8;
			if (
				!Number.isInteger(expectedBlockAlign) ||
				blockAlign !== expectedBlockAlign ||
				byteRate !== sampleRateHz * expectedBlockAlign
			) {
				throw new LocalTextToSpeechError(
					"Local TTS returned inconsistent WAV metadata",
				);
			}
			format = { bitsPerSample, channels, sampleRateHz };
		} else if (chunkId === "data") {
			if (dataBytes !== undefined) {
				throw new LocalTextToSpeechError(
					"Local TTS returned multiple WAV data chunks",
				);
			}
			dataBytes = chunkSize;
		}

		offset = nextOffset;
	}

	if (!format || blockAlign === undefined || dataBytes === undefined) {
		throw new LocalTextToSpeechError("Local TTS returned incomplete WAV audio");
	}
	if (dataBytes === 0 || dataBytes % blockAlign !== 0) {
		throw new LocalTextToSpeechError(
			"Local TTS WAV must contain complete, non-empty audio frames",
		);
	}
	if (
		format.channels !== LOCAL_TTS_CHANNELS ||
		format.sampleRateHz !== LOCAL_TTS_SAMPLE_RATE_HZ ||
		format.bitsPerSample !== LOCAL_TTS_BITS_PER_SAMPLE
	) {
		throw new LocalTextToSpeechError(
			"Local TTS WAV must be mono 24000 Hz 16-bit PCM",
		);
	}
	return format;
}

function assertMetadataHeader(
	headers: Headers,
	name: string,
	expected: number,
): void {
	const rawValue = headers.get(name);
	if (rawValue === null) return;
	const normalized = rawValue.trim();
	if (!/^\d+$/.test(normalized) || Number(normalized) !== expected) {
		throw new LocalTextToSpeechError(
			`Local TTS ${name} header conflicts with WAV metadata`,
		);
	}
}

@Injectable()
export class LocalTextToSpeechAdapter implements TextToSpeechPort {
	constructor(
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
	) {}

	/** Fetches one bounded utterance without falling back to a cloud provider. */
	async synthesize(input: SynthesizeSpeechInput): Promise<SpeechChunk> {
		const voice =
			input.voice ?? this._config.get("LOCAL_TTS_VOICE", { infer: true });
		const timeoutMs = this._config.get("LOCAL_TTS_TIMEOUT_MS", { infer: true });
		const timeoutSignal = AbortSignal.timeout(timeoutMs);
		const signal = input.signal
			? AbortSignal.any([input.signal, timeoutSignal])
			: timeoutSignal;
		const endpoint = new URL(
			"/synthesize",
			this._config.get("LOCAL_TTS_URL", { infer: true }),
		);

		let response: Response;
		let bytes: Buffer;
		try {
			response = await fetch(endpoint.toString(), {
				body: JSON.stringify({ text: input.text, voice }),
				headers: {
					Accept: LOCAL_TTS_MIME_TYPE,
					"Content-Type": "application/json",
				},
				method: "POST",
				signal,
			});

			if (!response.ok) {
				const detail = await readHttpErrorDetail(response);
				const statusText = response.statusText.trim().slice(0, 128);
				const status = `${response.status} ${statusText}`.trim();
				throw new LocalTextToSpeechError(
					`Local TTS request failed with HTTP ${status}${detail ? `: ${detail}` : ""}`,
				);
			}

			const mimeType = normalizeAudioMimeType(
				response.headers.get("content-type") ?? "",
			);
			if (mimeType !== LOCAL_TTS_MIME_TYPE) {
				await cancelResponseBody(response);
				throw new LocalTextToSpeechError(
					`Local TTS returned unsupported audio type: ${mimeType || "missing"}`,
				);
			}
			bytes = await readBoundedAudio(response);
		} catch (error) {
			if (input.signal?.aborted) {
				throw new LocalTextToSpeechError("Local TTS request was cancelled", {
					cause: error,
				});
			}
			if (timeoutSignal.aborted) {
				throw new LocalTextToSpeechError(
					`Local TTS request timed out after ${timeoutMs} ms`,
					{ cause: error },
				);
			}
			if (error instanceof LocalTextToSpeechError) throw error;
			throw new LocalTextToSpeechError(
				`Local TTS request failed: ${formatErrorCause(error)}`,
				{ cause: error },
			);
		}

		const metadata = validateWave(bytes);
		assertMetadataHeader(
			response.headers,
			"X-Sample-Rate",
			metadata.sampleRateHz,
		);
		assertMetadataHeader(response.headers, "X-Channels", metadata.channels);
		assertMetadataHeader(
			response.headers,
			"X-Bit-Depth",
			metadata.bitsPerSample,
		);
		return {
			bytes,
			channels: metadata.channels,
			mimeType: LOCAL_TTS_MIME_TYPE,
			sampleRateHz: metadata.sampleRateHz,
		};
	}
}
