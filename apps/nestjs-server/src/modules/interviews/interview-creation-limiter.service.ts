import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

type UsageWindow = {
	startedAt: number;
	count: number;
};

@Injectable()
export class InterviewCreationLimiterService {
	private static readonly _MAX_CREATIONS = 5;
	private static readonly _WINDOW_MS = 10 * 60_000;
	private readonly _activeUsers = new Set<string>();
	private readonly _inFlight = new Map<string, Promise<unknown>>();
	private readonly _usage = new Map<string, UsageWindow>();

	/** Consumes one per-user provider quota entry and prunes expired windows. */
	private _consume(userId: string): void {
		const now = Date.now();
		if (this._usage.size > 1_000) {
			for (const [key, window] of this._usage) {
				if (
					window.startedAt + InterviewCreationLimiterService._WINDOW_MS <=
					now
				) {
					this._usage.delete(key);
				}
			}
		}
		const existing = this._usage.get(userId);
		const window =
			existing &&
			existing.startedAt + InterviewCreationLimiterService._WINDOW_MS > now
				? existing
				: { startedAt: now, count: 0 };
		if (window.count >= InterviewCreationLimiterService._MAX_CREATIONS) {
			throw new HttpException(
				"Interview creation rate limit exceeded. Please retry later.",
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}
		window.count += 1;
		this._usage.set(userId, window);
	}

	/** Single-flights retries and permits only one provider create per user. */
	run<T>(
		userId: string,
		clientRequestId: string,
		operation: () => Promise<T>,
	): Promise<T> {
		const key = `${userId}:${clientRequestId}`;
		const existing = this._inFlight.get(key);
		if (existing) return existing as Promise<T>;
		if (this._activeUsers.has(userId)) {
			throw new HttpException(
				"Another interview is already being created. Please wait.",
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}

		this._consume(userId);
		this._activeUsers.add(userId);
		const tracked = Promise.resolve()
			.then(operation)
			.finally(() => {
				this._activeUsers.delete(userId);
				this._inFlight.delete(key);
			});
		this._inFlight.set(key, tracked);
		return tracked;
	}
}
