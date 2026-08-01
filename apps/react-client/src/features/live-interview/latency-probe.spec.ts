import { describe, expect, it, vi } from "vitest";
import { LatencyProbe } from "./latency-probe";

describe("LatencyProbe", () => {
	it("measures one round trip and allows the next probe", async () => {
		const now = vi
			.fn()
			.mockReturnValueOnce(100)
			.mockReturnValueOnce(142)
			.mockReturnValue(200);
		const probe = new LatencyProbe(now);

		await expect(probe.measure(async () => undefined)).resolves.toBe(42);
		await expect(probe.measure(async () => undefined)).resolves.toBe(0);
	});

	it("suppresses overlapping probes", async () => {
		let resolveSend: () => void = () => undefined;
		const pendingSend = new Promise<void>((resolve) => {
			resolveSend = resolve;
		});
		const probe = new LatencyProbe(() => 10);
		const first = probe.measure(() => pendingSend);

		await expect(probe.measure(async () => undefined)).resolves.toBeNull();
		resolveSend();
		await expect(first).resolves.toBe(0);
	});

	it("ignores a result from before reset and accepts a new generation", async () => {
		let resolveOld: () => void = () => undefined;
		const oldSend = new Promise<void>((resolve) => {
			resolveOld = resolve;
		});
		const probe = new LatencyProbe(() => 25);
		const oldMeasurement = probe.measure(() => oldSend);

		probe.reset();
		await expect(probe.measure(async () => undefined)).resolves.toBe(0);
		resolveOld();
		await expect(oldMeasurement).resolves.toBeNull();
	});
});
