export const L16_MIME_TYPE = "audio/l16" as const;
export const PCM16_BYTES_PER_SAMPLE = 2;
export const MIN_PCM_SAMPLE_RATE_HZ = 8_000;
export const MAX_PCM_SAMPLE_RATE_HZ = 96_000;

export type Pcm16Endianness = "big" | "little";

/** Coalesces complete PCM16 sample bytes into bounded transport chunks. */
export class Pcm16ChunkAccumulator {
	private _pending = new Uint8Array(0);

	constructor(private readonly _maxChunkBytes: number) {
		if (
			!Number.isInteger(_maxChunkBytes) ||
			_maxChunkBytes < PCM16_BYTES_PER_SAMPLE ||
			_maxChunkBytes % PCM16_BYTES_PER_SAMPLE !== 0
		) {
			throw new RangeError("PCM chunk bytes must be a positive even integer");
		}
	}

	get pendingBytes(): number {
		return this._pending.byteLength;
	}

	/** Adds encoded samples and returns every newly completed transport chunk. */
	append(bytes: Uint8Array): Uint8Array[] {
		if (bytes.byteLength % PCM16_BYTES_PER_SAMPLE !== 0) {
			throw new RangeError("PCM16 input must contain complete samples");
		}
		if (bytes.byteLength === 0) return [];

		const joined = new Uint8Array(this._pending.byteLength + bytes.byteLength);
		joined.set(this._pending, 0);
		joined.set(bytes, this._pending.byteLength);
		const chunks: Uint8Array[] = [];
		let offset = 0;
		while (joined.byteLength - offset >= this._maxChunkBytes) {
			chunks.push(joined.slice(offset, offset + this._maxChunkBytes));
			offset += this._maxChunkBytes;
		}
		this._pending = joined.slice(offset);
		return chunks;
	}

	/** Returns the final partial chunk exactly once at a microphone turn boundary. */
	flush(): Uint8Array | undefined {
		if (this._pending.byteLength === 0) return undefined;
		const chunk = this._pending;
		this._pending = new Uint8Array(0);
		return chunk;
	}

	/** Drops pending bytes when a turn is cancelled or fails. */
	reset(): void {
		this._pending = new Uint8Array(0);
	}
}

/** Ensures a sample rate satisfies the server's raw PCM contract. */
export function assertPcmSampleRate(sampleRateHz: number): void {
	if (
		!Number.isInteger(sampleRateHz) ||
		sampleRateHz < MIN_PCM_SAMPLE_RATE_HZ ||
		sampleRateHz > MAX_PCM_SAMPLE_RATE_HZ
	) {
		throw new RangeError(
			`PCM sample rate must be an integer from ${MIN_PCM_SAMPLE_RATE_HZ} to ${MAX_PCM_SAMPLE_RATE_HZ} Hz`,
		);
	}
}

/** Returns the lower-case MIME type without optional parameters. */
export function normalizeMediaMimeType(mimeType: string): string {
	return (mimeType.split(";", 1)[0] ?? "").trim().toLowerCase();
}

/** Ensures an audio chunk is standards-compatible signed linear PCM. */
export function assertL16MimeType(mimeType: string): void {
	if (normalizeMediaMimeType(mimeType) !== L16_MIME_TYPE) {
		throw new TypeError(`Unsupported PCM MIME type: ${mimeType}`);
	}
}

/**
 * Encodes normalized Web Audio samples as signed PCM16.
 *
 * `audio/L16` uses network byte order, so big-endian is the default. Values are
 * clamped to [-1, 1], and non-finite samples become silence.
 */
export function encodePcm16(
	samples: Float32Array,
	endianness: Pcm16Endianness = "big",
): Uint8Array {
	const bytes = new Uint8Array(samples.length * PCM16_BYTES_PER_SAMPLE);
	const view = new DataView(bytes.buffer);
	const littleEndian = endianness === "little";

	for (let index = 0; index < samples.length; index += 1) {
		const input = samples[index] ?? 0;
		const normalized = Number.isFinite(input)
			? Math.max(-1, Math.min(1, input))
			: 0;
		const encoded = Math.round(
			normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff,
		);
		view.setInt16(index * PCM16_BYTES_PER_SAMPLE, encoded, littleEndian);
	}

	return bytes;
}

/**
 * Decodes complete interleaved signed PCM16 frames into Web Audio channels.
 * The caller must retain any partial frame that spans transport chunks.
 */
export function decodePcm16Interleaved(
	bytes: Uint8Array,
	channels: number,
	endianness: Pcm16Endianness = "big",
): Float32Array[] {
	if (!Number.isInteger(channels) || channels < 1 || channels > 2) {
		throw new RangeError("PCM playback supports one or two channels");
	}

	const frameBytes = channels * PCM16_BYTES_PER_SAMPLE;
	if (bytes.byteLength % frameBytes !== 0) {
		throw new RangeError("PCM bytes must contain complete interleaved frames");
	}

	const frameCount = bytes.byteLength / frameBytes;
	const output = Array.from(
		{ length: channels },
		() => new Float32Array(frameCount),
	);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const littleEndian = endianness === "little";

	for (let frame = 0; frame < frameCount; frame += 1) {
		for (let channel = 0; channel < channels; channel += 1) {
			const offset = (frame * channels + channel) * PCM16_BYTES_PER_SAMPLE;
			const value = view.getInt16(offset, littleEndian);
			const channelData = output[channel];
			if (channelData) {
				channelData[frame] = value < 0 ? value / 0x8000 : value / 0x7fff;
			}
		}
	}

	return output;
}
