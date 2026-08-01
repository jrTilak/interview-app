import {
	assertL16MimeType,
	assertPcmSampleRate,
	decodePcm16Interleaved,
	PCM16_BYTES_PER_SAMPLE,
	type Pcm16Endianness,
} from "./pcm16.js";

export type RawPcmPlaybackChunk = {
	channels: number;
	data: ArrayBuffer | Uint8Array;
	mimeType: string;
	sampleRateHz: number;
	sequence: number;
	turnId: string;
};

export interface PcmAudioBufferLike {
	getChannelData(channel: number): Float32Array;
}

export interface PcmAudioBufferSourceLike {
	buffer: PcmAudioBufferLike | null;
	onended: (() => void) | null;
	connect(destination: unknown): unknown;
	disconnect(): void;
	start(when?: number): void;
	stop(): void;
}

export interface PcmAudioContextLike {
	readonly currentTime: number;
	readonly destination: unknown;
	readonly state: AudioContextState;
	close(): Promise<void>;
	createBuffer(
		numberOfChannels: number,
		length: number,
		sampleRate: number,
	): PcmAudioBufferLike;
	createBufferSource(): PcmAudioBufferSourceLike;
	resume(): Promise<void>;
}

export type RawPcmAudioPlayerOptions = {
	contextFactory?: () => PcmAudioContextLike;
	endianness?: Pcm16Endianness;
};

type PcmTurnMetadata = {
	channels: number;
	sampleRateHz: number;
};

type WindowWithWebkitAudio = Window & {
	webkitAudioContext?: typeof AudioContext;
};

function createBrowserAudioContext(): PcmAudioContextLike {
	const Constructor =
		window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
	if (!Constructor) throw new Error("Web Audio is unavailable in this browser");
	return new Constructor() as unknown as PcmAudioContextLike;
}

function copyBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
	if (data instanceof Uint8Array) return data.slice();
	return new Uint8Array(data.slice(0));
}

function sameMetadata(left: PcmTurnMetadata, right: PcmTurnMetadata): boolean {
	return (
		left.channels === right.channels && left.sampleRateHz === right.sampleRateHz
	);
}

/**
 * Buffers one server-provided L16 turn, then plays it through Web Audio.
 *
 * A turn must begin before sequence zero and end after its final chunk. The end
 * signal creates exactly one browser audio source after every byte has arrived.
 * Its promise resolves only when playback has actually drained, allowing callers
 * to delay microphone capture even if the server has already entered LISTENING.
 */
export class RawPcmAudioQueuePlayer {
	private _activeTurnId?: string;
	private _bufferedByteLength = 0;
	private _bufferedParts: Uint8Array[] = [];
	private _context?: PcmAudioContextLike;
	private readonly _contextFactory: () => PcmAudioContextLike;
	private _disposed = false;
	private readonly _drainResolvers = new Set<() => void>();
	private readonly _endianness: Pcm16Endianness;
	private _expectedSequence = 0;
	private _inputEnded = false;
	private readonly _pendingSources = new Set<PcmAudioBufferSourceLike>();
	private _turnMetadata?: PcmTurnMetadata;

	constructor(options: RawPcmAudioPlayerOptions = {}) {
		this._contextFactory = options.contextFactory ?? createBrowserAudioContext;
		this._endianness = options.endianness ?? "big";
	}

	get activeTurnId(): string | undefined {
		return this._activeTurnId;
	}

	get pendingBufferCount(): number {
		return this._pendingSources.size;
	}

	/** Reports whether browser playback has been unlocked by a user gesture. */
	get isRunning(): boolean {
		return this._context?.state === "running";
	}

	/** Resumes Web Audio from the lobby's explicit user gesture. */
	async resume(): Promise<void> {
		const context = this._getContext();
		if (context.state !== "running") await context.resume();
	}

	/** Opens one independent assistant turn whose first chunk must be sequence zero. */
	beginTurn(turnId: string): void {
		if (this._disposed) throw new Error("The PCM player has been disposed");
		if (!turnId.trim()) throw new TypeError("Assistant turn ID is required");
		if (this._activeTurnId || this._pendingSources.size > 0) {
			throw new Error("Another assistant audio turn is still active");
		}

		this._activeTurnId = turnId;
		this._bufferedByteLength = 0;
		this._bufferedParts = [];
		this._expectedSequence = 0;
		this._inputEnded = false;
		this._turnMetadata = undefined;
	}

	/** Validates and stores exactly the next transport chunk without playing it. */
	enqueue(chunk: RawPcmPlaybackChunk): void {
		if (!this._activeTurnId || chunk.turnId !== this._activeTurnId) {
			throw new Error("PCM chunk does not match the active assistant turn");
		}
		if (this._inputEnded) {
			throw new Error("Assistant audio input has already ended");
		}
		if (chunk.sequence !== this._expectedSequence) {
			throw new RangeError(
				`Expected PCM chunk ${this._expectedSequence}, received ${chunk.sequence}`,
			);
		}
		assertL16MimeType(chunk.mimeType);
		assertPcmSampleRate(chunk.sampleRateHz);
		if (
			!Number.isInteger(chunk.channels) ||
			chunk.channels < 1 ||
			chunk.channels > 2
		) {
			throw new RangeError("PCM playback supports one or two channels");
		}

		const incoming = copyBytes(chunk.data);
		if (incoming.byteLength === 0) {
			throw new RangeError("PCM playback chunks cannot be empty");
		}
		const metadata: PcmTurnMetadata = {
			channels: chunk.channels,
			sampleRateHz: chunk.sampleRateHz,
		};
		if (this._turnMetadata && !sameMetadata(this._turnMetadata, metadata)) {
			throw new Error("PCM metadata changed during an assistant turn");
		}

		this._turnMetadata ??= metadata;
		this._bufferedParts.push(incoming);
		this._bufferedByteLength += incoming.byteLength;
		this._expectedSequence += 1;
	}

	/** Plays the fully received turn once, then resolves after it has drained. */
	async endTurn(turnId: string): Promise<void> {
		if (!this._activeTurnId || turnId !== this._activeTurnId) {
			throw new Error("Assistant turn end does not match the active turn");
		}
		if (this._inputEnded) {
			throw new Error("Assistant audio input has already ended");
		}
		const metadata = this._turnMetadata;
		if (
			metadata &&
			this._bufferedByteLength %
				(PCM16_BYTES_PER_SAMPLE * metadata.channels) !==
				0
		) {
			throw new RangeError("Assistant audio ended with a partial PCM frame");
		}

		this._inputEnded = true;
		if (metadata && this._bufferedByteLength > 0) {
			const bytes = new Uint8Array(this._bufferedByteLength);
			let offset = 0;
			for (const part of this._bufferedParts) {
				bytes.set(part, offset);
				offset += part.byteLength;
			}
			this._play(bytes, metadata.channels, metadata.sampleRateHz);
		}
		await this.waitUntilDrained();
		if (this._activeTurnId === turnId) this._resetTurn();
	}

	/** Resolves immediately when idle or after every currently scheduled source ends. */
	waitUntilDrained(): Promise<void> {
		if (this._pendingSources.size === 0) return Promise.resolve();
		return new Promise((resolve) => this._drainResolvers.add(resolve));
	}

	/** Stops queued playback and clears the current turn without closing Web Audio. */
	stop(): void {
		for (const source of this._pendingSources) {
			source.onended = null;
			try {
				source.stop();
			} catch {
				// A source that ended between checks is already safe to discard.
			}
			source.disconnect();
		}
		this._pendingSources.clear();
		this._resolveDrained();
		this._resetTurn();
	}

	/** Stops playback and permanently closes the lazily created AudioContext. */
	async dispose(): Promise<void> {
		if (this._disposed) return;
		this.stop();
		this._disposed = true;
		if (this._context && this._context.state !== "closed") {
			await this._context.close();
		}
		this._context = undefined;
	}

	private _getContext(): PcmAudioContextLike {
		if (this._disposed) throw new Error("The PCM player has been disposed");
		this._context ??= this._contextFactory();
		return this._context;
	}

	private _play(
		bytes: Uint8Array,
		channels: number,
		sampleRateHz: number,
	): void {
		const decoded = decodePcm16Interleaved(bytes, channels, this._endianness);
		const frameCount = decoded[0]?.length ?? 0;
		if (frameCount === 0) return;

		const context = this._getContext();
		const buffer = context.createBuffer(channels, frameCount, sampleRateHz);
		for (let channel = 0; channel < channels; channel += 1) {
			const channelData = decoded[channel];
			if (channelData) buffer.getChannelData(channel).set(channelData);
		}

		const source = context.createBufferSource();
		source.buffer = buffer;
		source.connect(context.destination);
		source.onended = () => {
			source.disconnect();
			this._pendingSources.delete(source);
			this._resolveDrained();
		};
		this._pendingSources.add(source);
		try {
			source.start(context.currentTime);
		} catch (error) {
			source.onended = null;
			source.disconnect();
			this._pendingSources.delete(source);
			this._resolveDrained();
			throw error;
		}
	}

	private _resolveDrained(): void {
		if (this._pendingSources.size > 0) return;
		for (const resolve of this._drainResolvers) resolve();
		this._drainResolvers.clear();
	}

	private _resetTurn(): void {
		this._activeTurnId = undefined;
		this._bufferedByteLength = 0;
		this._bufferedParts = [];
		this._expectedSequence = 0;
		this._inputEnded = false;
		this._turnMetadata = undefined;
	}
}
