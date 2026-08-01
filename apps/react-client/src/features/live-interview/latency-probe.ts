export type LatencyClock = () => number;

/** Measures one round trip while suppressing overlaps and stale reset results. */
export class LatencyProbe {
	private _generation = 0;
	private _pending = false;

	constructor(private readonly _now: LatencyClock = () => performance.now()) {}

	reset(): void {
		this._generation += 1;
		this._pending = false;
	}

	async measure(send: () => Promise<void>): Promise<number | null> {
		if (this._pending) return null;
		this._pending = true;
		const generation = this._generation;
		const startedAt = this._now();
		try {
			await send();
			if (generation !== this._generation) return null;
			return Math.max(0, this._now() - startedAt);
		} finally {
			if (generation === this._generation) this._pending = false;
		}
	}
}
