import type {
	MicrophoneFrameSourceResult,
	MonoMicrophoneFrameSource,
} from "./microphone-capture.js";

const CAPTURE_PROCESSOR_NAME = "interview-pcm-microphone-capture";
const CAPTURE_PROCESSOR_SOURCE = `
class InterviewPcmMicrophoneCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      const copy = channel.slice();
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor("${CAPTURE_PROCESSOR_NAME}", InterviewPcmMicrophoneCapture);
`;

export type WebAudioMicrophoneSourceOptions = {
	autoGainControl?: boolean;
	echoCancellation?: boolean;
	noiseSuppression?: boolean;
	sampleRateHz?: number;
};

export type WebAudioMicrophoneDependencies = {
	createAudioContext?: () => AudioContext;
	createObjectUrl?: (blob: Blob) => string;
	createWorkletNode?: (
		context: AudioContext,
		name: string,
		options: AudioWorkletNodeOptions,
	) => AudioWorkletNode;
	mediaStream?: MediaStream;
	mediaDevices?: Pick<MediaDevices, "getUserMedia">;
	revokeObjectUrl?: (url: string) => void;
};

type WindowWithWebkitAudio = Window & {
	webkitAudioContext?: typeof AudioContext;
};

function createBrowserAudioContext(sampleRateHz: number): AudioContext {
	const Constructor =
		window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
	if (!Constructor) throw new Error("Web Audio is unavailable in this browser");
	return new Constructor({ sampleRate: sampleRateHz });
}

/**
 * Acquires one browser microphone and exposes mono Float32 AudioWorklet frames.
 * Every partial browser resource is released when acquisition fails or stops.
 */
export class WebAudioMicrophoneFrameSource
	implements MonoMicrophoneFrameSource
{
	private readonly _dependencies: WebAudioMicrophoneDependencies;
	private readonly _options: Required<WebAudioMicrophoneSourceOptions>;
	private _context?: AudioContext;
	private _mediaSource?: MediaStreamAudioSourceNode;
	private _ownsStream = false;
	private _stream?: MediaStream;
	private _worklet?: AudioWorkletNode;

	constructor(
		options: WebAudioMicrophoneSourceOptions = {},
		dependencies: WebAudioMicrophoneDependencies = {},
	) {
		this._options = {
			autoGainControl: options.autoGainControl ?? true,
			echoCancellation: options.echoCancellation ?? true,
			noiseSuppression: options.noiseSuppression ?? true,
			sampleRateHz: options.sampleRateHz ?? 16_000,
		};
		if (
			!Number.isInteger(this._options.sampleRateHz) ||
			this._options.sampleRateHz < 8_000 ||
			this._options.sampleRateHz > 96_000
		) {
			throw new RangeError(
				"Microphone sample rate must be an integer from 8000 to 96000",
			);
		}
		this._dependencies = dependencies;
	}

	/** Requests the microphone from a user gesture and begins worklet capture. */
	async start(
		onFrame: (samples: Float32Array) => void,
	): Promise<MicrophoneFrameSourceResult> {
		if (this._stream || this._context) {
			throw new Error("The browser microphone source is already active");
		}

		try {
			if (this._dependencies.mediaStream) {
				this._stream = this._dependencies.mediaStream;
				this._ownsStream = false;
			} else {
				const mediaDevices =
					this._dependencies.mediaDevices ?? navigator.mediaDevices;
				if (!mediaDevices?.getUserMedia) {
					throw new Error("Microphone capture is unavailable in this browser");
				}
				this._stream = await mediaDevices.getUserMedia({
					audio: {
						autoGainControl: this._options.autoGainControl,
						channelCount: { ideal: 1 },
						echoCancellation: this._options.echoCancellation,
						noiseSuppression: this._options.noiseSuppression,
					},
					video: false,
				});
				this._ownsStream = true;
			}
			if (this._stream.getAudioTracks().length === 0) {
				throw new Error("The provided media stream has no microphone track");
			}
			this._context =
				this._dependencies.createAudioContext?.() ??
				createBrowserAudioContext(this._options.sampleRateHz);

			const createObjectUrl =
				this._dependencies.createObjectUrl ?? URL.createObjectURL.bind(URL);
			const revokeObjectUrl =
				this._dependencies.revokeObjectUrl ?? URL.revokeObjectURL.bind(URL);
			const workletUrl = createObjectUrl(
				new Blob([CAPTURE_PROCESSOR_SOURCE], {
					type: "application/javascript",
				}),
			);
			try {
				await this._context.audioWorklet.addModule(workletUrl);
			} finally {
				revokeObjectUrl(workletUrl);
			}

			this._worklet = this._dependencies.createWorkletNode
				? this._dependencies.createWorkletNode(
						this._context,
						CAPTURE_PROCESSOR_NAME,
						{ numberOfInputs: 1, numberOfOutputs: 0 },
					)
				: new AudioWorkletNode(this._context, CAPTURE_PROCESSOR_NAME, {
						numberOfInputs: 1,
						numberOfOutputs: 0,
					});
			this._worklet.port.onmessage = (event: MessageEvent<unknown>) => {
				const value = event.data;
				if (value instanceof Float32Array) onFrame(value);
				else if (value instanceof ArrayBuffer) onFrame(new Float32Array(value));
			};
			this._mediaSource = this._context.createMediaStreamSource(this._stream);
			this._mediaSource.connect(this._worklet);
			await this._context.resume();
			return { sampleRateHz: this._context.sampleRate };
		} catch (error) {
			await this.stop();
			throw error;
		}
	}

	/** Disconnects processing, stops every track, and releases the AudioContext. */
	async stop(): Promise<void> {
		if (this._worklet) {
			this._worklet.port.onmessage = null;
			this._worklet.port.close();
			this._worklet.disconnect();
		}
		this._mediaSource?.disconnect();
		if (this._ownsStream) {
			for (const track of this._stream?.getTracks() ?? []) track.stop();
		}
		if (this._context && this._context.state !== "closed") {
			await this._context.close().catch(() => undefined);
		}

		this._worklet = undefined;
		this._mediaSource = undefined;
		this._ownsStream = false;
		this._stream = undefined;
		this._context = undefined;
	}
}
