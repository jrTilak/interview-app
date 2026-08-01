import {
	AcousticSilenceDetector,
	type AcousticSilenceDetectorOptions,
} from "./acoustic-silence-detector.js";
import {
	assertPcmSampleRate,
	encodePcm16,
	L16_MIME_TYPE,
	Pcm16ChunkAccumulator,
	type Pcm16Endianness,
} from "./pcm16.js";

export type MicrophoneFrameSourceResult = {
	sampleRateHz: number;
};

export interface MonoMicrophoneFrameSource {
	start(
		onFrame: (samples: Float32Array) => void,
	): Promise<MicrophoneFrameSourceResult>;
	stop(): Promise<void>;
}

export type MicrophonePcmChunk = {
	channels: 1;
	data: Uint8Array;
	mimeType: typeof L16_MIME_TYPE;
	sampleRateHz: number;
	sequence: number;
};

export type MicrophoneCaptureCompletion = {
	lastSequence: number;
	reason: "manual" | "silence";
	sampleRateHz: number;
	totalBytes: number;
};

export interface MicrophoneCaptureSink {
	onChunk(chunk: MicrophonePcmChunk): Promise<void> | void;
	onComplete(completion: MicrophoneCaptureCompletion): Promise<void> | void;
	onError?(error: unknown): void;
}

export type MicrophoneCaptureOptions = {
	endianness?: Pcm16Endianness;
	maxChunkBytes?: number;
	maxTurnBytes?: number;
	vad?: Omit<AcousticSilenceDetectorOptions, "sampleRateHz">;
};

export type MicrophoneCaptureState =
	| "idle"
	| "starting"
	| "recording"
	| "stopping";

const DEFAULT_MAX_CHUNK_BYTES = 16 * 1_024;
const DEFAULT_MAX_TURN_BYTES = 8 * 1_024 * 1_024;
const MAX_SOCKET_CHUNK_BYTES = 1_024 * 1_024;

/** Identifies a manual stop before any microphone bytes were captured. */
export class EmptyMicrophoneCaptureError extends Error {
	constructor() {
		super("The microphone turn did not contain audio");
		this.name = "EmptyMicrophoneCaptureError";
	}
}

/**
 * Converts mono Web Audio frames into an ordered, bounded L16 turn.
 *
 * The controller is deliberately independent from React and Socket.IO. A hook
 * can own one instance, provide a browser frame source, and translate sink
 * callbacks into acknowledged realtime events.
 */
export class PcmMicrophoneCaptureController {
	private readonly _endianness: Pcm16Endianness;
	private readonly _chunkAccumulator: Pcm16ChunkAccumulator;
	private readonly _maxTurnBytes: number;
	private readonly _sink: MicrophoneCaptureSink;
	private readonly _source: MonoMicrophoneFrameSource;
	private readonly _vadOptions: Omit<
		AcousticSilenceDetectorOptions,
		"sampleRateHz"
	>;
	private _failure: unknown;
	private _finishPromise?: Promise<MicrophoneCaptureCompletion>;
	private _sampleRateHz?: number;
	private _sequence = 0;
	private _state: MicrophoneCaptureState = "idle";
	private _totalBytes = 0;
	private _vad?: AcousticSilenceDetector;
	private _writeChain: Promise<void> = Promise.resolve();

	constructor(
		source: MonoMicrophoneFrameSource,
		sink: MicrophoneCaptureSink,
		options: MicrophoneCaptureOptions = {},
	) {
		const maxChunkBytes = options.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
		const maxTurnBytes = options.maxTurnBytes ?? DEFAULT_MAX_TURN_BYTES;
		if (
			!Number.isInteger(maxChunkBytes) ||
			maxChunkBytes < 2 ||
			maxChunkBytes > MAX_SOCKET_CHUNK_BYTES ||
			maxChunkBytes % 2 !== 0
		) {
			throw new RangeError(
				"Maximum PCM chunk bytes must be an even integer from 2 to 1048576",
			);
		}
		if (
			!Number.isInteger(maxTurnBytes) ||
			maxTurnBytes < maxChunkBytes ||
			maxTurnBytes % 2 !== 0
		) {
			throw new RangeError(
				"Maximum PCM turn bytes must be an even integer at least as large as one chunk",
			);
		}

		this._source = source;
		this._sink = sink;
		this._endianness = options.endianness ?? "big";
		this._chunkAccumulator = new Pcm16ChunkAccumulator(maxChunkBytes);
		this._maxTurnBytes = maxTurnBytes;
		this._vadOptions = options.vad ?? {};
	}

	get sampleRateHz(): number | undefined {
		return this._sampleRateHz;
	}

	get state(): MicrophoneCaptureState {
		return this._state;
	}

	/** Acquires the source, establishes its actual rate, and starts one turn. */
	async start(): Promise<MicrophoneFrameSourceResult> {
		if (this._state !== "idle") {
			throw new Error("A microphone capture is already active");
		}

		this._resetTurn();
		this._state = "starting";
		const earlyFrames: Float32Array[] = [];
		let acceptsFrames = true;

		try {
			const result = await this._source.start((samples) => {
				if (!acceptsFrames) return;
				if (this._state === "starting") {
					earlyFrames.push(samples.slice());
					return;
				}
				this._acceptFrame(samples);
			});
			assertPcmSampleRate(result.sampleRateHz);
			this._sampleRateHz = result.sampleRateHz;
			this._vad = new AcousticSilenceDetector({
				...this._vadOptions,
				sampleRateHz: result.sampleRateHz,
			});
			this._state = "recording";
			for (const frame of earlyFrames) {
				if (this._state !== "recording") break;
				this._acceptFrame(frame);
			}
			return result;
		} catch (error) {
			acceptsFrames = false;
			await this._source.stop().catch(() => undefined);
			this._state = "idle";
			this._reportError(error);
			throw error;
		}
	}

	/** Flushes acknowledged chunks before reporting the explicit turn boundary. */
	finish(
		reason: MicrophoneCaptureCompletion["reason"] = "manual",
	): Promise<MicrophoneCaptureCompletion> {
		return this._finish(reason);
	}

	/** Stops capture without producing a microphone-end callback. */
	async cancel(): Promise<void> {
		if (this._finishPromise) {
			await this._finishPromise.catch(() => undefined);
			return;
		}
		if (this._state === "idle") return;

		this._state = "stopping";
		await this._source.stop().catch(() => undefined);
		await this._writeChain.catch(() => undefined);
		this._state = "idle";
		this._resetTurn();
	}

	private _acceptFrame(samples: Float32Array): void {
		if (this._state !== "recording" || samples.length === 0) return;

		try {
			const bytes = encodePcm16(samples, this._endianness);
			if (this._totalBytes + bytes.byteLength > this._maxTurnBytes) {
				throw new RangeError(
					"The microphone turn exceeded its client byte limit",
				);
			}
			this._totalBytes += bytes.byteLength;
			for (const chunk of this._chunkAccumulator.append(bytes)) {
				this._queueChunk(chunk);
			}

			const observation = this._vad?.observe(samples);
			if (observation?.shouldComplete) {
				void this._finish("silence").catch(() => undefined);
			}
		} catch (error) {
			this._requestFailure(error);
		}
	}

	private _queueChunk(data: Uint8Array): void {
		const sampleRateHz = this._sampleRateHz;
		if (sampleRateHz === undefined) {
			throw new Error("Microphone sample rate is unavailable");
		}

		const chunk: MicrophonePcmChunk = {
			channels: 1,
			data,
			mimeType: L16_MIME_TYPE,
			sampleRateHz,
			sequence: this._sequence,
		};
		this._sequence += 1;
		this._writeChain = this._writeChain.then(() => this._sink.onChunk(chunk));
		void this._writeChain.catch((error) => this._requestFailure(error));
	}

	private _finish(
		reason: MicrophoneCaptureCompletion["reason"] | "error",
	): Promise<MicrophoneCaptureCompletion> {
		if (this._finishPromise) return this._finishPromise;
		if (this._state !== "recording") {
			return Promise.reject(new Error("No microphone capture is recording"));
		}

		this._finishPromise = this._finishTurn(reason);
		return this._finishPromise;
	}

	private async _finishTurn(
		reason: MicrophoneCaptureCompletion["reason"] | "error",
	): Promise<MicrophoneCaptureCompletion> {
		this._state = "stopping";
		let stopError: unknown;
		try {
			await this._source.stop();
		} catch (error) {
			stopError = error;
		}
		if (
			reason !== "error" &&
			this._failure === undefined &&
			stopError === undefined
		) {
			const finalChunk = this._chunkAccumulator.flush();
			if (finalChunk) this._queueChunk(finalChunk);
		}

		let writeError: unknown;
		try {
			await this._writeChain;
		} catch (error) {
			writeError = error;
		}

		try {
			const failure = this._failure ?? writeError ?? stopError;
			if (failure !== undefined || reason === "error") {
				throw failure ?? new Error("Microphone capture failed");
			}
			if (this._totalBytes === 0 || this._sequence === 0) {
				throw new EmptyMicrophoneCaptureError();
			}
			const sampleRateHz = this._sampleRateHz;
			if (sampleRateHz === undefined) {
				throw new Error("Microphone sample rate is unavailable");
			}

			const completion: MicrophoneCaptureCompletion = {
				lastSequence: this._sequence - 1,
				reason,
				sampleRateHz,
				totalBytes: this._totalBytes,
			};
			await this._sink.onComplete(completion);
			return completion;
		} catch (error) {
			this._reportError(error);
			throw error;
		} finally {
			this._state = "idle";
			this._finishPromise = undefined;
			this._resetTurn();
		}
	}

	private _requestFailure(error: unknown): void {
		if (this._failure === undefined) this._failure = error;
		if (this._state === "recording") {
			void this._finish("error").catch(() => undefined);
		}
	}

	private _reportError(error: unknown): void {
		try {
			this._sink.onError?.(error);
		} catch {
			// Error observers must not replace the original media failure.
		}
	}

	private _resetTurn(): void {
		this._failure = undefined;
		this._sampleRateHz = undefined;
		this._sequence = 0;
		this._totalBytes = 0;
		this._vad = undefined;
		this._chunkAccumulator.reset();
		this._writeChain = Promise.resolve();
	}
}
