import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfigService } from "../../../types/index.js";
import { normalizeAudioMimeType } from "../audio-formats.js";
import type { SpeechToTextPort, TranscribeAudioInput } from "./stt.port.js";

const LOCAL_STT_AUDIO_MIME_TYPES = new Set([
	"audio/wav",
	"audio/wave",
	"audio/x-wav",
	"audio/l16",
]);
const LOCAL_STT_RESPONSE_MIME_TYPE = "application/json";
const MAX_TRANSCRIPT_RESPONSE_BYTES = 128 * 1024;
const MAX_HTTP_ERROR_BYTES = 4 * 1024;
const MIN_PCM_SAMPLE_RATE_HZ = 8_000;
const MAX_PCM_SAMPLE_RATE_HZ = 192_000;

class LocalSpeechToTextError extends Error {}

function formatErrorCause(error: unknown): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	return "unknown network error";
}

function parseContentLength(value: string | null): number | undefined {
	if (value === null) return undefined;
	const normalized = value.trim();
	if (!/^\d+$/.test(normalized)) {
		throw new LocalSpeechToTextError(
			"Local STT returned an invalid Content-Length header",
		);
	}
	const length = Number(normalized);
	if (!Number.isSafeInteger(length)) {
		throw new LocalSpeechToTextError(
			"Local STT returned an invalid Content-Length header",
		);
	}
	return length;
}

async function cancelResponseBody(response: Response): Promise<void> {
	await response.body?.cancel().catch(() => undefined);
}

async function readBoundedBody(
	response: Response,
	maximumBytes: number,
	limitMessage: string,
): Promise<Buffer> {
	const contentLength = parseContentLength(
		response.headers.get("content-length"),
	);
	if (contentLength !== undefined && contentLength > maximumBytes) {
		await cancelResponseBody(response);
		throw new LocalSpeechToTextError(limitMessage);
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
			if (totalBytes > maximumBytes) {
				await reader.cancel().catch(() => undefined);
				throw new LocalSpeechToTextError(limitMessage);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks, totalBytes);
}

async function readHttpErrorDetail(response: Response): Promise<string> {
	let bytes: Buffer;
	try {
		bytes = await readBoundedBody(
			response,
			MAX_HTTP_ERROR_BYTES,
			"Local STT error response exceeded the detail limit",
		);
	} catch (error) {
		if (
			error instanceof LocalSpeechToTextError &&
			error.message.includes("detail limit")
		) {
			return "response detail omitted because it was too large";
		}
		throw error;
	}
	return new TextDecoder().decode(bytes).replace(/\s+/g, " ").trim();
}

function createAudioForm(
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

function validateInput(
	input: TranscribeAudioInput,
	maximumBytes: number,
): string {
	const mimeType = normalizeAudioMimeType(input.mimeType);
	if (!LOCAL_STT_AUDIO_MIME_TYPES.has(mimeType)) {
		throw new LocalSpeechToTextError(
			`Unsupported local transcription audio type: ${mimeType || "missing"}`,
		);
	}
	if (input.bytes.byteLength === 0) {
		throw new LocalSpeechToTextError("Local STT audio must not be empty");
	}
	if (input.bytes.byteLength > maximumBytes) {
		throw new LocalSpeechToTextError(
			`Local STT audio exceeds the ${maximumBytes}-byte request limit`,
		);
	}
	if (mimeType !== "audio/l16") return mimeType;

	const sampleRateHz = input.sampleRateHz;
	const channels = input.channels;
	if (
		sampleRateHz === undefined ||
		!Number.isInteger(sampleRateHz) ||
		sampleRateHz < MIN_PCM_SAMPLE_RATE_HZ ||
		sampleRateHz > MAX_PCM_SAMPLE_RATE_HZ
	) {
		throw new LocalSpeechToTextError(
			"Local STT raw PCM requires a sample rate from 8000 to 192000 Hz",
		);
	}
	if (
		channels === undefined ||
		!Number.isInteger(channels) ||
		channels < 1 ||
		channels > 2
	) {
		throw new LocalSpeechToTextError(
			"Local STT raw PCM requires one or two channels",
		);
	}
	if (input.bytes.byteLength % (channels * 2) !== 0) {
		throw new LocalSpeechToTextError(
			"Local STT raw PCM must contain complete 16-bit audio frames",
		);
	}
	return mimeType;
}

function parseTranscript(bytes: Buffer): string {
	let value: unknown;
	try {
		value = JSON.parse(bytes.toString("utf8"));
	} catch (error) {
		throw new LocalSpeechToTextError("Local STT returned malformed JSON", {
			cause: error,
		});
	}
	if (
		typeof value !== "object" ||
		value === null ||
		!("text" in value) ||
		typeof value.text !== "string"
	) {
		throw new LocalSpeechToTextError(
			"Local STT returned an invalid transcript payload",
		);
	}
	return value.text.trim();
}

@Injectable()
export class LocalSpeechToTextAdapter implements SpeechToTextPort {
	constructor(
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
	) {}

	/** Uploads one bounded candidate turn to the configured speech service. */
	async transcribe(input: TranscribeAudioInput): Promise<string> {
		const mimeType = validateInput(
			input,
			this._config.get("AUDIO_MAX_BYTES", { infer: true }),
		);
		const timeoutMs = this._config.get("LOCAL_STT_TIMEOUT_MS", {
			infer: true,
		});
		const timeoutSignal = AbortSignal.timeout(timeoutMs);
		const signal = input.signal
			? AbortSignal.any([input.signal, timeoutSignal])
			: timeoutSignal;
		const endpoint = new URL(
			"/transcribe",
			this._config.get("LOCAL_STT_URL", { infer: true }),
		);

		try {
			const response = await fetch(endpoint.toString(), {
				body: createAudioForm(input, mimeType),
				headers: { Accept: LOCAL_STT_RESPONSE_MIME_TYPE },
				method: "POST",
				signal,
			});
			if (!response.ok) {
				const detail = await readHttpErrorDetail(response);
				const statusText = response.statusText.trim().slice(0, 128);
				const status = `${response.status} ${statusText}`.trim();
				throw new LocalSpeechToTextError(
					`Local STT request failed with HTTP ${status}${detail ? `: ${detail}` : ""}`,
				);
			}

			const responseMimeType = normalizeAudioMimeType(
				response.headers.get("content-type") ?? "",
			);
			if (responseMimeType !== LOCAL_STT_RESPONSE_MIME_TYPE) {
				await cancelResponseBody(response);
				throw new LocalSpeechToTextError(
					`Local STT returned unsupported response type: ${responseMimeType || "missing"}`,
				);
			}
			const bytes = await readBoundedBody(
				response,
				MAX_TRANSCRIPT_RESPONSE_BYTES,
				`Local STT transcript exceeds the ${MAX_TRANSCRIPT_RESPONSE_BYTES}-byte response limit`,
			);
			return parseTranscript(bytes);
		} catch (error) {
			if (input.signal?.aborted) {
				throw new LocalSpeechToTextError("Local STT request was cancelled", {
					cause: error,
				});
			}
			if (timeoutSignal.aborted) {
				throw new LocalSpeechToTextError(
					`Local STT request timed out after ${timeoutMs} ms`,
					{ cause: error },
				);
			}
			if (error instanceof LocalSpeechToTextError) throw error;
			throw new LocalSpeechToTextError(
				`Local STT request failed: ${formatErrorCause(error)}`,
				{ cause: error },
			);
		}
	}
}
