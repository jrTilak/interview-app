export type LatencyQuality = "excellent" | "high" | "stable" | "unknown";

/** Converts round-trip latency into a compact, explainable room status. */
export function getLatencyQuality(latencyMs: number | null): LatencyQuality {
	if (latencyMs === null || !Number.isFinite(latencyMs) || latencyMs < 0) {
		return "unknown";
	}
	if (latencyMs <= 100) return "excellent";
	if (latencyMs <= 250) return "stable";
	return "high";
}

export function formatLatency(latencyMs: number | null): string {
	return latencyMs === null ? "— ms" : `${Math.round(latencyMs)} ms`;
}
