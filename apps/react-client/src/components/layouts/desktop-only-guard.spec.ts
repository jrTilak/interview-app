import { describe, expect, it } from "vitest";
import {
	type DesktopSignals,
	getDesktopBlockReason,
} from "./desktop-only-guard";

const desktop: DesktopSignals = {
	coarsePointer: false,
	maxTouchPoints: 0,
	platform: "Linux x86_64",
	userAgent: "Mozilla/5.0 Chrome/140",
	viewportWidth: 1440,
};

describe("desktop support classification", () => {
	it("allows a sufficiently wide fine-pointer desktop", () => {
		expect(getDesktopBlockReason(desktop)).toBeNull();
	});

	it("blocks mobile, coarse pointer, and disguised iPad devices", () => {
		expect(
			getDesktopBlockReason({ ...desktop, userAgent: "Mozilla/5.0 iPhone" }),
		).toBe("device");
		expect(getDesktopBlockReason({ ...desktop, coarsePointer: true })).toBe(
			"device",
		);
		expect(
			getDesktopBlockReason({
				...desktop,
				maxTouchPoints: 5,
				platform: "MacIntel",
			}),
		).toBe("device");
	});

	it("asks only narrow desktop windows to widen", () => {
		expect(getDesktopBlockReason({ ...desktop, viewportWidth: 1099 })).toBe(
			"viewport",
		);
	});
});
