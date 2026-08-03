import type { InterviewSocket } from "./protocol";
import { emitWithAck } from "./socket-ack";

type DisposableMediaKind = "camera" | "screen";

type DisposableMediaStreamerOptions = {
	attemptId: string;
	canSend: () => boolean;
	kind: DisposableMediaKind;
	onError?: (error: unknown) => void;
	socket: InterviewSocket;
	stream: MediaStream;
};

const MAX_CLIENT_MEDIA_CHUNK_BYTES = 480 * 1024;

type PlaybackPausableStreamer = Pick<
	DisposableMediaStreamer,
	"pause" | "resume"
>;

/** Pauses every available disposable encoder for assistant playback. */
export function pauseDisposableMediaStreamers(
	...streamers: Array<PlaybackPausableStreamer | undefined>
): void {
	for (const streamer of streamers) streamer?.pause();
}

/** Resumes every available disposable encoder after playback or cancellation. */
export function resumeDisposableMediaStreamers(
	...streamers: Array<PlaybackPausableStreamer | undefined>
): void {
	for (const streamer of streamers) streamer?.resume();
}

/** Sends low-bitrate video chunks with single-flight backpressure for disposal. */
export class DisposableMediaStreamer {
	private _inFlight = false;
	private readonly _options: DisposableMediaStreamerOptions;
	private _recorder?: MediaRecorder;
	private _sequence = 0;

	constructor(options: DisposableMediaStreamerOptions) {
		this._options = options;
	}

	start(): void {
		if (this._recorder) return;
		if (typeof MediaRecorder === "undefined") {
			throw new Error("Video transport is unavailable in this browser.");
		}
		const videoTracks = this._options.stream
			.getVideoTracks()
			.filter((track) => track.readyState === "live");
		if (videoTracks.length === 0) {
			throw new Error(`${this._options.kind} has no active video track.`);
		}
		const stream = new MediaStream(videoTracks);
		const preferredMime = "video/webm;codecs=vp8";
		const mimeType = MediaRecorder.isTypeSupported(preferredMime)
			? preferredMime
			: "video/webm";
		this._recorder = new MediaRecorder(stream, {
			mimeType,
			videoBitsPerSecond: this._options.kind === "camera" ? 280_000 : 420_000,
		});
		this._recorder.addEventListener("dataavailable", this._handleData);
		this._recorder.addEventListener("error", this._handleRecorderError);
		this._recorder.start(1_000);
	}

	/** Suspends video encoding while interviewer audio is playing. */
	pause(): void {
		if (this._recorder?.state === "recording") this._recorder.pause();
	}

	/** Continues video encoding after interviewer audio has drained. */
	resume(): void {
		if (this._recorder?.state === "paused") this._recorder.resume();
	}

	stop(): void {
		if (!this._recorder) return;
		this._recorder.removeEventListener("dataavailable", this._handleData);
		this._recorder.removeEventListener("error", this._handleRecorderError);
		if (this._recorder.state !== "inactive") this._recorder.stop();
		this._recorder = undefined;
		this._inFlight = false;
	}

	private readonly _handleData = (event: BlobEvent): void => {
		if (
			this._inFlight ||
			!this._options.canSend() ||
			event.data.size === 0 ||
			event.data.size > MAX_CLIENT_MEDIA_CHUNK_BYTES
		) {
			return;
		}
		this._inFlight = true;
		const sequence = this._sequence;
		this._sequence += 1;
		void event.data
			.arrayBuffer()
			.then((data) =>
				emitWithAck(this._options.socket, `${this._options.kind}:chunk`, {
					attemptId: this._options.attemptId,
					data,
					mimeType: event.data.type || "video/webm",
					sequence,
				}),
			)
			.catch((error) => this._options.onError?.(error))
			.finally(() => {
				this._inFlight = false;
			});
	};

	private readonly _handleRecorderError = (event: Event): void => {
		this._options.onError?.(
			event instanceof ErrorEvent
				? event.error
				: new Error("MediaRecorder failed"),
		);
	};
}
