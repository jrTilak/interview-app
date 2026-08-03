export type CompletedAudioPlaybackChunk = {
	data: ArrayBuffer | Uint8Array;
	mimeType: string;
	sequence: number;
	turnId: string;
};

export type DecodedAudioBufferLike = object;

export interface DecodedAudioBufferSourceLike {
	buffer: DecodedAudioBufferLike | null;
	onended: (() => void) | null;
	connect(destination: unknown): unknown;
	disconnect(): void;
	start(): void;
	stop(): void;
}

export interface PlaybackAudioContextLike {
	readonly destination: unknown;
	readonly state: AudioContextState;
	close(): Promise<void>;
	createBufferSource(): DecodedAudioBufferSourceLike;
	decodeAudioData(audioData: ArrayBuffer): Promise<DecodedAudioBufferLike>;
	resume(): Promise<void>;
}

export type CompletedAudioPlayerOptions = {
	contextFactory?: () => PlaybackAudioContextLike;
};

type WindowWithWebkitAudio = Window & {
	webkitAudioContext?: typeof AudioContext;
};

const WAVE_MIME_TYPES = new Set(["audio/wav", "audio/wave", "audio/x-wav"]);

function createBrowserAudioContext(): PlaybackAudioContextLike {
	const Constructor =
		window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
	if (!Constructor) throw new Error("Web Audio is unavailable in this browser");
	return new Constructor({
		latencyHint: "playback",
	}) as unknown as PlaybackAudioContextLike;
}

function copyBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
	if (data instanceof Uint8Array) return data.slice();
	return new Uint8Array(data.slice(0));
}

function normalizeMimeType(mimeType: string): string {
	return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copied = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(copied).set(bytes);
	return copied;
}

/**
 * Buffers one complete WAV turn and lets the browser decode and play it once.
 *
 * Native decoding avoids JavaScript PCM conversion and starts exactly one audio
 * source only after the server's turn-end event confirms the file is complete.
 */
export class CompletedAudioTurnPlayer {
	private _activeTurnId?: string;
	private _bufferedByteLength = 0;
	private _bufferedParts: Uint8Array[] = [];
	private _context?: PlaybackAudioContextLike;
	private readonly _contextFactory: () => PlaybackAudioContextLike;
	private _disposed = false;
	private readonly _drainResolvers = new Set<() => void>();
	private _expectedSequence = 0;
	private _generation = 0;
	private _inputEnded = false;
	private _mimeType?: string;
	private readonly _pendingSources = new Set<DecodedAudioBufferSourceLike>();

	constructor(options: CompletedAudioPlayerOptions = {}) {
		this._contextFactory = options.contextFactory ?? createBrowserAudioContext;
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

	/** Opens one assistant turn whose first file part must be sequence zero. */
	beginTurn(turnId: string): void {
		if (this._disposed) throw new Error("The audio player has been disposed");
		if (!turnId.trim()) throw new TypeError("Assistant turn ID is required");
		if (this._activeTurnId || this._pendingSources.size > 0) {
			throw new Error("Another assistant audio turn is still active");
		}

		this._generation += 1;
		this._activeTurnId = turnId;
		this._bufferedByteLength = 0;
		this._bufferedParts = [];
		this._expectedSequence = 0;
		this._inputEnded = false;
		this._mimeType = undefined;
	}

	/** Validates and stores exactly the next WAV file part without playing it. */
	enqueue(chunk: CompletedAudioPlaybackChunk): void {
		if (!this._activeTurnId || chunk.turnId !== this._activeTurnId) {
			throw new Error("Audio does not match the active assistant turn");
		}
		if (this._inputEnded) {
			throw new Error("Assistant audio input has already ended");
		}
		if (chunk.sequence !== this._expectedSequence) {
			throw new RangeError(
				`Expected audio part ${this._expectedSequence}, received ${chunk.sequence}`,
			);
		}

		const mimeType = normalizeMimeType(chunk.mimeType);
		if (!WAVE_MIME_TYPES.has(mimeType)) {
			throw new TypeError(
				`Unsupported assistant audio type: ${chunk.mimeType}`,
			);
		}
		if (this._mimeType && this._mimeType !== mimeType) {
			throw new Error("Audio type changed during an assistant turn");
		}

		const incoming = copyBytes(chunk.data);
		if (incoming.byteLength === 0) {
			throw new RangeError("Assistant audio parts cannot be empty");
		}
		this._mimeType ??= mimeType;
		this._bufferedParts.push(incoming);
		this._bufferedByteLength += incoming.byteLength;
		this._expectedSequence += 1;
	}

	/** Decodes the fully received WAV once and resolves after playback drains. */
	async endTurn(turnId: string): Promise<void> {
		if (!this._activeTurnId || turnId !== this._activeTurnId) {
			throw new Error("Assistant turn end does not match the active turn");
		}
		if (this._inputEnded) {
			throw new Error("Assistant audio input has already ended");
		}

		const generation = this._generation;
		this._inputEnded = true;
		if (this._bufferedByteLength > 0) {
			const bytes = new Uint8Array(this._bufferedByteLength);
			let offset = 0;
			for (const part of this._bufferedParts) {
				bytes.set(part, offset);
				offset += part.byteLength;
			}
			await this._decodeAndPlay(bytes, turnId, generation);
		}
		await this.waitUntilDrained();
		if (this._activeTurnId === turnId && this._generation === generation) {
			this._resetTurn();
		}
	}

	/** Resolves immediately when idle or after the current source ends. */
	waitUntilDrained(): Promise<void> {
		if (this._pendingSources.size === 0) return Promise.resolve();
		return new Promise((resolve) => this._drainResolvers.add(resolve));
	}

	/** Stops playback and clears the current turn without closing Web Audio. */
	stop(): void {
		this._generation += 1;
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

	private async _decodeAndPlay(
		bytes: Uint8Array,
		turnId: string,
		generation: number,
	): Promise<void> {
		const context = this._getContext();
		const buffer = await context.decodeAudioData(toArrayBuffer(bytes));
		if (
			this._disposed ||
			this._activeTurnId !== turnId ||
			this._generation !== generation
		) {
			return;
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
			source.start();
		} catch (error) {
			source.onended = null;
			source.disconnect();
			this._pendingSources.delete(source);
			this._resolveDrained();
			throw error;
		}
	}

	private _getContext(): PlaybackAudioContextLike {
		if (this._disposed) throw new Error("The audio player has been disposed");
		this._context ??= this._contextFactory();
		return this._context;
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
		this._mimeType = undefined;
	}
}
