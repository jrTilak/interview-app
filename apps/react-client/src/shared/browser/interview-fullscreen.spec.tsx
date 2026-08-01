import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	canUseInterviewFullscreen,
	requestInterviewFullscreen,
	useInterviewFullscreen,
} from "./interview-fullscreen";

const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
	document,
	"fullscreenElement",
);
const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(
	document,
	"fullscreenEnabled",
);
const requestFullscreen = document.documentElement.requestFullscreen;

afterEach(() => {
	if (fullscreenElementDescriptor) {
		Object.defineProperty(
			document,
			"fullscreenElement",
			fullscreenElementDescriptor,
		);
	} else {
		Reflect.deleteProperty(document, "fullscreenElement");
	}
	if (fullscreenEnabledDescriptor) {
		Object.defineProperty(
			document,
			"fullscreenEnabled",
			fullscreenEnabledDescriptor,
		);
	} else {
		Reflect.deleteProperty(document, "fullscreenEnabled");
	}
	if (requestFullscreen) {
		document.documentElement.requestFullscreen = requestFullscreen;
	} else {
		Reflect.deleteProperty(document.documentElement, "requestFullscreen");
	}
	vi.restoreAllMocks();
});

describe("interview fullscreen", () => {
	it("rejects browsers without the standards-based API", async () => {
		Object.defineProperty(document, "fullscreenEnabled", {
			configurable: true,
			value: false,
		});

		expect(canUseInterviewFullscreen()).toBe(false);
		await expect(requestInterviewFullscreen()).rejects.toThrow(
			"Fullscreen is unavailable",
		);
	});

	it("enters fullscreen and counts every later exit", async () => {
		let element: Element | null = null;
		Object.defineProperty(document, "fullscreenEnabled", {
			configurable: true,
			value: true,
		});
		Object.defineProperty(document, "fullscreenElement", {
			configurable: true,
			get: () => element,
		});
		const request = vi.fn(async () => {
			element = document.documentElement;
			document.dispatchEvent(new Event("fullscreenchange"));
		});
		document.documentElement.requestFullscreen = request;
		const { result } = renderHook(() => useInterviewFullscreen());

		await act(() => result.current.enter());
		expect(request).toHaveBeenCalledWith({ navigationUI: "hide" });
		expect(result.current.active).toBe(true);

		act(() => {
			element = null;
			document.dispatchEvent(new Event("fullscreenchange"));
		});
		expect(result.current.active).toBe(false);
		expect(result.current.violations).toBe(1);
	});
});
