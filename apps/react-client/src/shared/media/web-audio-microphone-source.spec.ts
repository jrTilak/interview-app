import { describe, expect, it, vi } from "vitest";
import { WebAudioMicrophoneFrameSource } from "./web-audio-microphone-source.js";

describe("WebAudioMicrophoneFrameSource", () => {
	it.each([8_000, 96_000])(
		"accepts the %i Hz sample-rate boundary",
		(sampleRateHz) => {
			expect(
				() => new WebAudioMicrophoneFrameSource({ sampleRateHz }),
			).not.toThrow();
		},
	);

	it.each([7_999, 16_000.5, 96_001, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects the invalid sample rate %s",
		(sampleRateHz) => {
			expect(
				() => new WebAudioMicrophoneFrameSource({ sampleRateHz }),
			).toThrowError(
				new RangeError(
					"Microphone sample rate must be an integer from 8000 to 96000",
				),
			);
		},
	);

	it("captures worklet frames and preserves an injected lobby media stream", async () => {
		const track = { stop: vi.fn() };
		const stream = {
			getAudioTracks: () => [track],
			getTracks: () => [track],
		} as unknown as MediaStream;
		const mediaSource = {
			connect: vi.fn(),
			disconnect: vi.fn(),
		} as unknown as MediaStreamAudioSourceNode;
		const port = {
			close: vi.fn(),
			onmessage: null,
		} as unknown as MessagePort;
		const worklet = {
			disconnect: vi.fn(),
			port,
		} as unknown as AudioWorkletNode;
		const context = {
			audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
			close: vi.fn().mockResolvedValue(undefined),
			createMediaStreamSource: vi.fn(() => mediaSource),
			resume: vi.fn().mockResolvedValue(undefined),
			sampleRate: 48_000,
			state: "running",
		} as unknown as AudioContext;
		const revokeObjectUrl = vi.fn();
		const source = new WebAudioMicrophoneFrameSource(
			{},
			{
				createAudioContext: () => context,
				createObjectUrl: () => "blob:microphone-worklet",
				createWorkletNode: () => worklet,
				mediaStream: stream,
				revokeObjectUrl,
			},
		);
		const frames: Float32Array[] = [];

		await expect(source.start((frame) => frames.push(frame))).resolves.toEqual({
			sampleRateHz: 48_000,
		});
		port.onmessage?.({
			data: new Float32Array([0.25, -0.25]),
		} as MessageEvent<Float32Array>);
		expect(Array.from(frames[0] ?? [])).toEqual([0.25, -0.25]);
		expect(mediaSource.connect).toHaveBeenCalledWith(worklet);
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:microphone-worklet");

		await source.stop();
		expect(track.stop).not.toHaveBeenCalled();
		expect(mediaSource.disconnect).toHaveBeenCalledOnce();
		expect(port.close).toHaveBeenCalledOnce();
		expect(context.close).toHaveBeenCalledOnce();
	});
});
