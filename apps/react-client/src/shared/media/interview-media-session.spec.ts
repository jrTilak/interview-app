import { afterEach, describe, expect, it, vi } from "vitest";
import { InterviewMediaSession } from "./interview-media-session";

const originalMediaDevices = navigator.mediaDevices;

function displayStream(displaySurface: DisplayCaptureSurfaceType) {
	const stop = vi.fn();
	const track = {
		addEventListener: vi.fn(),
		getSettings: () => ({ displaySurface }),
		readyState: "live",
		stop,
	};
	const stream = {
		getAudioTracks: () => [],
		getTracks: () => [track],
		getVideoTracks: () => [track],
	} as unknown as MediaStream;
	return { stop, stream };
}

afterEach(() => {
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: originalMediaDevices,
	});
});

describe("InterviewMediaSession screen capture", () => {
	it("accepts an entire monitor and forwards restrictive capture hints", async () => {
		const { stream } = displayStream("monitor");
		const getDisplayMedia = vi.fn().mockResolvedValue(stream);
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getDisplayMedia },
		});

		const session = new InterviewMediaSession();
		await expect(session.acquireScreen()).resolves.toBe(stream);
		expect(session.getSnapshot().screenActive).toBe(true);
		expect(getDisplayMedia).toHaveBeenCalledWith(
			expect.objectContaining({
				monitorTypeSurfaces: "include",
				selfBrowserSurface: "exclude",
				surfaceSwitching: "exclude",
			}),
		);
	});

	it("stops and rejects a browser-tab share when a monitor is required", async () => {
		const { stop, stream } = displayStream("browser");
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getDisplayMedia: vi.fn().mockResolvedValue(stream) },
		});

		const session = new InterviewMediaSession();
		await expect(session.acquireScreen()).rejects.toThrow("Entire Screen");
		expect(stop).toHaveBeenCalledOnce();
		expect(session.getSnapshot().screenActive).toBe(false);
	});
});
