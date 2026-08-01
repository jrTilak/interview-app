import { describe, expect, it } from "vitest";
import {
	assertL16MimeType,
	assertPcmSampleRate,
	decodePcm16Interleaved,
	encodePcm16,
	Pcm16ChunkAccumulator,
} from "./pcm16.js";

describe("PCM16 primitives", () => {
	it("encodes clamped samples as big-endian L16 network bytes", () => {
		const encoded = encodePcm16(
			new Float32Array([-1, -0.5, 0, 0.5, 1, -2, 2, Number.NaN]),
		);

		expect(Array.from(encoded)).toEqual([
			0x80, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x40, 0x00, 0x7f, 0xff, 0x80, 0x00,
			0x7f, 0xff, 0x00, 0x00,
		]);
	});

	it("can explicitly encode little-endian provider PCM", () => {
		expect(
			Array.from(encodePcm16(new Float32Array([-1, 1]), "little")),
		).toEqual([0x00, 0x80, 0xff, 0x7f]);
	});

	it("coalesces small PCM frames and flushes one bounded remainder", () => {
		const chunks = new Pcm16ChunkAccumulator(4);

		expect(chunks.append(new Uint8Array([0, 1]))).toEqual([]);
		expect(chunks.append(new Uint8Array([2, 3, 4, 5]))).toEqual([
			new Uint8Array([0, 1, 2, 3]),
		]);
		expect(chunks.pendingBytes).toBe(2);
		expect(chunks.flush()).toEqual(new Uint8Array([4, 5]));
		expect(chunks.flush()).toBeUndefined();
	});

	it("decodes interleaved stereo frames into normalized channels", () => {
		const [left, right] = decodePcm16Interleaved(
			new Uint8Array([0x7f, 0xff, 0x80, 0x00, 0x40, 0x00, 0xc0, 0x00]),
			2,
		);

		expect(Array.from(left ?? [])).toEqual([
			expect.closeTo(1, 6),
			expect.closeTo(0.5, 4),
		]);
		expect(Array.from(right ?? [])).toEqual([
			expect.closeTo(-1, 6),
			expect.closeTo(-0.5, 4),
		]);
	});

	it("rejects invalid rates, MIME types, channels, and partial frames", () => {
		expect(() => assertPcmSampleRate(8_000)).not.toThrow();
		expect(() => assertPcmSampleRate(96_000)).not.toThrow();
		expect(() => assertPcmSampleRate(7_999)).toThrow(RangeError);
		expect(() => assertPcmSampleRate(44_100.5)).toThrow(RangeError);
		expect(() => assertL16MimeType("Audio/L16; rate=24000")).not.toThrow();
		expect(() => assertL16MimeType("audio/webm")).toThrow(TypeError);
		expect(() => decodePcm16Interleaved(new Uint8Array(2), 3)).toThrow(
			RangeError,
		);
		expect(() => decodePcm16Interleaved(new Uint8Array(1), 1)).toThrow(
			RangeError,
		);
	});
});
