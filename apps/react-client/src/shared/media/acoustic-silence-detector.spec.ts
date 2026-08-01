import { describe, expect, it } from "vitest";
import {
	AcousticSilenceDetector,
	calculateRms,
} from "./acoustic-silence-detector.js";

const frame = (amplitude: number, length = 80) =>
	new Float32Array(length).fill(amplitude);

describe("AcousticSilenceDetector", () => {
	it("does not end on silence until sustained speech has begun", () => {
		const detector = new AcousticSilenceDetector({
			minimumSpeechMs: 20,
			sampleRateHz: 8_000,
			silenceDurationMs: 30,
			speechThreshold: 0.1,
		});

		for (let index = 0; index < 10; index += 1) {
			expect(detector.observe(frame(0))).toMatchObject({
				phase: "waiting-for-speech",
				shouldComplete: false,
			});
		}
		expect(detector.observe(frame(0.5)).phase).toBe("waiting-for-speech");
		expect(detector.observe(frame(0.5)).phase).toBe("speaking");
		expect(detector.observe(frame(0)).phase).toBe("silence");
		expect(detector.observe(frame(0)).shouldComplete).toBe(false);
		expect(detector.observe(frame(0))).toMatchObject({
			phase: "complete",
			shouldComplete: true,
		});
		expect(detector.observe(frame(0))).toMatchObject({
			phase: "complete",
			shouldComplete: false,
		});
	});

	it("resets a partial silence window when speech resumes", () => {
		const detector = new AcousticSilenceDetector({
			minimumSpeechMs: 10,
			sampleRateHz: 8_000,
			silenceDurationMs: 30,
			speechThreshold: 0.1,
		});

		detector.observe(frame(0.5));
		expect(detector.observe(frame(0, 160)).phase).toBe("silence");
		expect(detector.observe(frame(0.5)).phase).toBe("speaking");
		expect(detector.observe(frame(0, 160))).toMatchObject({
			phase: "silence",
			shouldComplete: false,
		});
	});

	it("calculates RMS and treats invalid samples as silence", () => {
		expect(calculateRms(new Float32Array([1, -1]))).toBe(1);
		expect(calculateRms(new Float32Array([0.5, -0.5]))).toBe(0.5);
		expect(calculateRms(new Float32Array([Number.NaN, 0]))).toBe(0);
		expect(calculateRms(new Float32Array())).toBe(0);
	});
});
