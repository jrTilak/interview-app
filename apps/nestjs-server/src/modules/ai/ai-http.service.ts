import { Injectable } from "@nestjs/common";

type AiHttpRequest = {
	name: string;
	url: URL;
	body: string | FormData;
	headers: Record<string, string>;
	timeoutMs: number;
	signal?: AbortSignal;
	expectedMimeType: string;
	responseType: "response type" | "audio type";
	maximumBytes: number;
	limitMessage: string;
};

export type AiHttpResponse = {
	bytes: Buffer;
	headers: Headers;
};

class AiHttpError extends Error {}
class AiResponseTooLargeError extends AiHttpError {}

/** Shared bounded HTTP transport used by the local AI adapters. */
@Injectable()
export class AiHttpService {
	private static readonly _MAX_ERROR_RESPONSE_BYTES = 4 * 1024;

	/** Sends one POST request and returns a MIME-checked, size-bounded body. */
	async post(request: AiHttpRequest): Promise<AiHttpResponse> {
		const timeoutSignal = AbortSignal.timeout(request.timeoutMs);
		const signal = request.signal
			? AbortSignal.any([request.signal, timeoutSignal])
			: timeoutSignal;

		try {
			const response = await fetch(request.url, {
				body: request.body,
				headers: request.headers,
				method: "POST",
				signal,
			});
			if (!response.ok) {
				const detail = await this._readErrorDetail(response, request.name);
				const statusText = response.statusText.trim().slice(0, 128);
				const status = `${response.status} ${statusText}`.trim();
				throw this.error(
					request.name,
					`request failed with HTTP ${status}${detail ? `: ${detail}` : ""}`,
				);
			}

			const mimeType = this._normalizeMimeType(
				response.headers.get("content-type") ?? "",
			);
			if (mimeType !== request.expectedMimeType) {
				await this._cancelResponse(response);
				throw this.error(
					request.name,
					`returned unsupported ${request.responseType}: ${mimeType || "missing"}`,
				);
			}

			return {
				bytes: await this._readBoundedBody(
					response,
					request.maximumBytes,
					request.name,
					request.limitMessage,
				),
				headers: response.headers,
			};
		} catch (error) {
			if (
				request.signal?.aborted &&
				signal.aborted &&
				signal.reason === request.signal.reason
			) {
				throw this.error(request.name, "request was cancelled", error);
			}
			if (
				timeoutSignal.aborted &&
				signal.aborted &&
				signal.reason === timeoutSignal.reason
			) {
				throw this.error(
					request.name,
					`request timed out after ${request.timeoutMs} ms`,
					error,
				);
			}
			if (error instanceof AiHttpError) throw error;
			throw this.error(
				request.name,
				`request failed: ${this._formatErrorCause(error)}`,
				error,
			);
		}
	}

	/** Parses JSON syntax while leaving payload validation to the adapter. */
	parseJson(name: string, bytes: Buffer): unknown {
		try {
			return JSON.parse(bytes.toString("utf8"));
		} catch (error) {
			throw this.error(name, "returned malformed JSON", error);
		}
	}

	/** Creates a consistently named adapter error. */
	error(name: string, message: string, cause?: unknown): Error {
		const fullMessage = `${name} ${message}`;
		return cause === undefined
			? new AiHttpError(fullMessage)
			: new AiHttpError(fullMessage, { cause });
	}

	private _formatErrorCause(error: unknown): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return "unknown network error";
	}

	private _normalizeMimeType(value: string): string {
		return (value.split(";", 1)[0] ?? "").trim().toLowerCase();
	}

	private _parseContentLength(
		name: string,
		value: string | null,
	): number | null {
		if (value === null) return null;
		const normalized = value.trim();
		if (!/^\d+$/.test(normalized)) {
			throw this.error(name, "returned an invalid Content-Length header");
		}
		const length = Number(normalized);
		if (!Number.isSafeInteger(length)) {
			throw this.error(name, "returned an invalid Content-Length header");
		}
		return length;
	}

	private async _cancelResponse(response: Response): Promise<void> {
		await response.body?.cancel().catch(() => undefined);
	}

	private async _readBoundedBody(
		response: Response,
		maximumBytes: number,
		name: string,
		limitMessage: string,
	): Promise<Buffer> {
		let contentLength: number | null;
		try {
			contentLength = this._parseContentLength(
				name,
				response.headers.get("content-length"),
			);
		} catch (error) {
			await this._cancelResponse(response);
			throw error;
		}
		if (contentLength !== null && contentLength > maximumBytes) {
			await this._cancelResponse(response);
			throw new AiResponseTooLargeError(`${name} ${limitMessage}`);
		}
		if (!response.body) return Buffer.alloc(0);

		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		const reader = response.body.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (!value) continue;
				totalBytes += value.byteLength;
				if (totalBytes > maximumBytes) {
					await reader.cancel().catch(() => undefined);
					throw new AiResponseTooLargeError(`${name} ${limitMessage}`);
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
		return Buffer.concat(chunks, totalBytes);
	}

	private async _readErrorDetail(
		response: Response,
		name: string,
	): Promise<string> {
		try {
			const bytes = await this._readBoundedBody(
				response,
				AiHttpService._MAX_ERROR_RESPONSE_BYTES,
				name,
				"error response exceeded the detail limit",
			);
			return bytes.toString("utf8").replace(/\s+/g, " ").trim();
		} catch (error) {
			if (error instanceof AiResponseTooLargeError) {
				return "response detail omitted because it was too large";
			}
			throw error;
		}
	}
}
