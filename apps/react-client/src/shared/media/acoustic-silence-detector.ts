import { assertPcmSampleRate } from "./pcm16.js";

export type AcousticSilencePhase =
	| "waiting-for-speech"
	| "speaking"
	| "silence"
	| "complete";

export type AcousticSilenceObservation = {
	phase: AcousticSilencePhase;
	rms: number;
	shouldComplete: boolean;
};

export type AcousticSilenceDetectorOptions = {
	sampleRateHz: number;
	silenceDurationMs?: number;
	speechThreshold?: number;
	minimumSpeechMs?: number;
};

const DEFAULT_MINIMUM_SPEECH_MS = 120;
const DEFAULT_SILENCE_DURATION_MS = 1_200;
const DEFAULT_SPEECH_THRESHOLD = 0.015;

/** Calculates root-mean-square amplitude while treating non-finite data as silence. */
export function calculateRms(samples: Float32Array): number {
	if (samples.length === 0) return 0;

	let sumOfSquares = 0;
	for (const sample of samples) {
		const finiteSample = Number.isFinite(sample) ? sample : 0;
		sumOfSquares += finiteSample * finiteSample;
	}
	return Math.sqrt(sumOfSquares / samples.length);
}

/**
 * Detects a real speech onset followed by sustained acoustic silence.
 *
 * Durations are derived from sample counts rather than wall-clock timers, which
 * makes behavior stable across render load, background tasks, and unit tests.
 */
export class AcousticSilenceDetector {
	private readonly _minimumSpeechSamples: number;
	private readonly _silenceSamplesRequired: number;
	private readonly _speechThreshold: number;
	private _candidateSpeechSamples = 0;
	private _completionReported = false;
	private _silentSamples = 0;
	private _speechDetected = false;

	constructor(options: AcousticSilenceDetectorOptions) {
		assertPcmSampleRate(options.sampleRateHz);
		const minimumSpeechMs =
			options.minimumSpeechMs ?? DEFAULT_MINIMUM_SPEECH_MS;
		const silenceDurationMs =
			options.silenceDurationMs ?? DEFAULT_SILENCE_DURATION_MS;
		const speechThreshold = options.speechThreshold ?? DEFAULT_SPEECH_THRESHOLD;

		if (!Number.isFinite(minimumSpeechMs) || minimumSpeechMs < 0) {
			throw new RangeError("Minimum speech duration cannot be negative");
		}
		if (!Number.isFinite(silenceDurationMs) || silenceDurationMs <= 0) {
			throw new RangeError("Silence duration must be greater than zero");
		}
		if (
			!Number.isFinite(speechThreshold) ||
			speechThreshold <= 0 ||
			speechThreshold > 1
		) {
			throw new RangeError(
				"Speech threshold must be greater than 0 and at most 1",
			);
		}

		this._minimumSpeechSamples = Math.ceil(
			(options.sampleRateHz * minimumSpeechMs) / 1_000,
		);
		this._silenceSamplesRequired = Math.ceil(
			(options.sampleRateHz * silenceDurationMs) / 1_000,
		);
		this._speechThreshold = speechThreshold;
	}

	/** Clears all onset, silence, and one-shot completion state for a new turn. */
	reset(): void {
		this._candidateSpeechSamples = 0;
		this._completionReported = false;
		this._silentSamples = 0;
		this._speechDetected = false;
	}

	/** Classifies one sequential mono frame and reports a one-shot turn boundary. */
	observe(samples: Float32Array): AcousticSilenceObservation {
		const rms = calculateRms(samples);
		if (samples.length === 0) {
			return {
				phase: this._currentPhase(),
				rms,
				shouldComplete: false,
			};
		}

		if (this._completionReported) {
			return { phase: "complete", rms, shouldComplete: false };
		}

		if (rms >= this._speechThreshold) {
			this._silentSamples = 0;
			if (!this._speechDetected) {
				this._candidateSpeechSamples += samples.length;
				if (this._candidateSpeechSamples >= this._minimumSpeechSamples) {
					this._speechDetected = true;
				}
			}
			return {
				phase: this._speechDetected ? "speaking" : "waiting-for-speech",
				rms,
				shouldComplete: false,
			};
		}

		if (!this._speechDetected) {
			this._candidateSpeechSamples = 0;
			return { phase: "waiting-for-speech", rms, shouldComplete: false };
		}

		this._silentSamples += samples.length;
		if (this._silentSamples >= this._silenceSamplesRequired) {
			this._completionReported = true;
			return { phase: "complete", rms, shouldComplete: true };
		}

		return { phase: "silence", rms, shouldComplete: false };
	}

	private _currentPhase(): AcousticSilencePhase {
		if (this._completionReported) return "complete";
		if (this._silentSamples > 0) return "silence";
		return this._speechDetected ? "speaking" : "waiting-for-speech";
	}
}
