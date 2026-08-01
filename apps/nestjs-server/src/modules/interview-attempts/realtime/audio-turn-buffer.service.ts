import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	PayloadTooLargeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfigService } from "../../../types/index.js";
import type {
	BufferedCandidateAudio,
	MicrophoneStartEvent,
} from "./interview-realtime.protocol.js";

type BufferEntry = MicrophoneStartEvent & {
	chunks: Uint8Array[];
	expectedSequence: number;
	totalBytes: number;
	timer?: NodeJS.Timeout;
	onSilence: () => void;
};

export const AUDIO_MAX_CHUNKS_PER_TURN = 32_768;

@Injectable()
export class AudioTurnBufferService {
	private readonly _buffers = new Map<string, BufferEntry>();
	private _totalBytes = 0;

	constructor(
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
	) {}

	/** Converts Socket.IO's supported binary representations to bytes. */
	private _toBytes(value: unknown): Uint8Array {
		if (Buffer.isBuffer(value)) return value;
		if (value instanceof Uint8Array) return value;
		if (value instanceof ArrayBuffer) return new Uint8Array(value);
		throw new BadRequestException("Audio chunk data must be binary");
	}

	/** Arms the no-chunk fallback used after client VAD stops transmitting. */
	private _armSilenceTimer(entry: BufferEntry): void {
		if (entry.timer) clearTimeout(entry.timer);
		entry.timer = setTimeout(
			entry.onSilence,
			this._config.get("AUDIO_SILENCE_MS", { infer: true }),
		);
		entry.timer.unref?.();
	}

	/** Opens one ordered, size-bounded microphone turn for a socket. */
	start(
		socketId: string,
		metadata: MicrophoneStartEvent,
		onSilence: () => void,
	): void {
		if (this._buffers.has(socketId)) {
			throw new ConflictException("A microphone turn is already open");
		}
		const entry: BufferEntry = {
			...metadata,
			chunks: [],
			expectedSequence: 0,
			totalBytes: 0,
			onSilence,
		};
		this._buffers.set(socketId, entry);
		this._armSilenceTimer(entry);
	}

	/** Appends exactly the next chunk and refreshes the inactivity fallback. */
	append(
		socketId: string,
		identity: { attemptId: string; turnId: string; sequence: number },
		data: unknown,
	): void {
		const entry = this._buffers.get(socketId);
		if (!entry) throw new ConflictException("No microphone turn is open");
		if (
			entry.attemptId !== identity.attemptId ||
			entry.turnId !== identity.turnId
		) {
			throw new ConflictException("Audio chunk does not match the open turn");
		}
		if (identity.sequence !== entry.expectedSequence) {
			throw new ConflictException(
				`Expected audio chunk ${entry.expectedSequence}, received ${identity.sequence}`,
			);
		}

		const bytes = this._toBytes(data);
		if (bytes.byteLength === 0) {
			throw new BadRequestException("Audio chunk must not be empty");
		}
		const perTurnLimit = this._config.get("AUDIO_MAX_BYTES", { infer: true });
		const nextSize = entry.totalBytes + bytes.byteLength;
		const nextGlobalSize = this._totalBytes + bytes.byteLength;
		if (
			entry.chunks.length >= AUDIO_MAX_CHUNKS_PER_TURN ||
			nextSize > perTurnLimit ||
			nextGlobalSize > perTurnLimit * 5
		) {
			this.clear(socketId);
			throw new PayloadTooLargeException(
				"Candidate audio buffering limit was exceeded",
			);
		}
		entry.chunks.push(bytes);
		entry.totalBytes = nextSize;
		this._totalBytes = nextGlobalSize;
		entry.expectedSequence += 1;
		this._armSilenceTimer(entry);
	}

	/** Closes a turn and returns its combined bytes exactly once. */
	finish(
		socketId: string,
		identity?: { attemptId: string; turnId: string; lastSequence: number },
	): BufferedCandidateAudio {
		const entry = this._buffers.get(socketId);
		if (!entry) throw new ConflictException("No microphone turn is open");
		if (
			identity &&
			(entry.attemptId !== identity.attemptId ||
				entry.turnId !== identity.turnId)
		) {
			throw new ConflictException(
				"Microphone end does not match the open turn",
			);
		}
		if (identity && identity.lastSequence !== entry.expectedSequence - 1) {
			throw new ConflictException(
				"Microphone end sequence does not match received audio",
			);
		}
		if (entry.totalBytes === 0) {
			this.clear(socketId);
			throw new BadRequestException("Candidate audio turn is empty");
		}

		this._buffers.delete(socketId);
		this._totalBytes -= entry.totalBytes;
		if (entry.timer) clearTimeout(entry.timer);
		return {
			attemptId: entry.attemptId,
			turnId: entry.turnId,
			mimeType: entry.mimeType,
			sampleRateHz: entry.sampleRateHz,
			channels: entry.channels,
			bytes: Buffer.concat(entry.chunks.map((chunk) => Buffer.from(chunk))),
		};
	}

	/** Drops transient microphone bytes for a disconnected or invalid socket. */
	clear(socketId: string): void {
		const entry = this._buffers.get(socketId);
		if (entry?.timer) clearTimeout(entry.timer);
		if (entry) this._totalBytes -= entry.totalBytes;
		this._buffers.delete(socketId);
	}
}
