import { UnprocessableEntityException } from "@nestjs/common";

const WAV_HEADER_BYTES = 44;
const PCM_FORMAT = 1;
const PCM16_BITS_PER_SAMPLE = 16;
const PCM16_BYTES_PER_SAMPLE = PCM16_BITS_PER_SAMPLE / 8;

export type Pcm16WaveInput = {
	bytes: Uint8Array;
	channels: number;
	sampleRateHz: number;
};

/** Wraps signed little-endian PCM16 in the canonical RIFF/WAVE container. */
export function wrapPcm16LittleEndianInWave(input: Pcm16WaveInput): Buffer {
	const { bytes, channels, sampleRateHz } = input;
	if (!Number.isInteger(channels) || channels < 1 || channels > 2) {
		throw new UnprocessableEntityException(
			"Raw PCM audio must contain one or two channels",
		);
	}
	if (
		!Number.isInteger(sampleRateHz) ||
		sampleRateHz < 8_000 ||
		sampleRateHz > 96_000
	) {
		throw new UnprocessableEntityException(
			"Raw PCM audio requires a sample rate from 8000 to 96000 Hz",
		);
	}

	const frameBytes = channels * PCM16_BYTES_PER_SAMPLE;
	if (bytes.byteLength === 0 || bytes.byteLength % frameBytes !== 0) {
		throw new UnprocessableEntityException(
			"Raw PCM audio must contain complete non-empty sample frames",
		);
	}

	const blockAlign = frameBytes;
	const byteRate = sampleRateHz * blockAlign;
	const wave = Buffer.allocUnsafe(WAV_HEADER_BYTES + bytes.byteLength);
	wave.write("RIFF", 0, "ascii");
	wave.writeUInt32LE(36 + bytes.byteLength, 4);
	wave.write("WAVE", 8, "ascii");
	wave.write("fmt ", 12, "ascii");
	wave.writeUInt32LE(16, 16);
	wave.writeUInt16LE(PCM_FORMAT, 20);
	wave.writeUInt16LE(channels, 22);
	wave.writeUInt32LE(sampleRateHz, 24);
	wave.writeUInt32LE(byteRate, 28);
	wave.writeUInt16LE(blockAlign, 32);
	wave.writeUInt16LE(PCM16_BITS_PER_SAMPLE, 34);
	wave.write("data", 36, "ascii");
	wave.writeUInt32LE(bytes.byteLength, 40);
	Buffer.from(bytes).copy(wave, WAV_HEADER_BYTES);
	return wave;
}
