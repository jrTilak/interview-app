import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import z from "zod";
import type { AppConfigService } from "#/types/index.js";
import type {
	GeneratedInterviewTurn,
	GenerateInterviewTurnInput,
	InterviewLlmPort,
	StructuredInterviewQuestion,
	StructureQuestionsInput,
} from "./llm.port.js";

const LOCAL_LLM_RESPONSE_MIME_TYPE = "application/json";
const MAX_LOCAL_LLM_REQUEST_BYTES = 512 * 1024;
const MAX_LOCAL_LLM_RESPONSE_BYTES = 512 * 1024;
const MAX_HTTP_ERROR_BYTES = 4 * 1024;
const MAX_TRANSCRIPT_CHARACTERS = 20_000;

const StructuredQuestionServiceSchema = z
	.object({
		id: z.string().nullable().optional(),
		title: z.string().trim().min(1).max(160),
		prompt: z.string().trim().min(1).max(4_000),
		objective: z.string().trim().min(1).max(2_000).nullable(),
		followUpGuidance: z.string().trim().min(1).max(2_000).nullable(),
		completed: z.boolean().optional(),
	})
	.strict();

const StructureQuestionsServiceResponseSchema = z
	.object({
		tasks: z.array(StructuredQuestionServiceSchema).min(1).max(30),
	})
	.strict();

const InterviewActionServiceSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("complete_questions"),
			questionIds: z.array(z.uuid()).min(1).max(30),
		})
		.strict(),
	z
		.object({
			type: z.literal("end_interview"),
			reason: z.string().trim().min(1).max(300),
		})
		.strict(),
]);

const InterviewTurnServiceResponseSchema = z
	.object({
		text: z.string().trim().min(1).max(4_000),
		actions: z.array(InterviewActionServiceSchema).max(30),
	})
	.strict();

class LocalLlmError extends Error {}

function formatErrorCause(error: unknown): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	return "unknown network error";
}

function normalizeMimeType(value: string): string {
	return (value.split(";", 1)[0] ?? "").trim().toLowerCase();
}

function parseContentLength(value: string | null): number | undefined {
	if (value === null) return undefined;
	const normalized = value.trim();
	if (!/^\d+$/.test(normalized)) {
		throw new LocalLlmError(
			"Local LLM returned an invalid Content-Length header",
		);
	}
	const length = Number(normalized);
	if (!Number.isSafeInteger(length)) {
		throw new LocalLlmError(
			"Local LLM returned an invalid Content-Length header",
		);
	}
	return length;
}

async function cancelResponseBody(response: Response): Promise<void> {
	await response.body?.cancel().catch(() => undefined);
}

async function readBoundedBody(
	response: Response,
	maximumBytes: number,
	limitMessage: string,
): Promise<Buffer> {
	const contentLength = parseContentLength(
		response.headers.get("content-length"),
	);
	if (contentLength !== undefined && contentLength > maximumBytes) {
		await cancelResponseBody(response);
		throw new LocalLlmError(limitMessage);
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
				throw new LocalLlmError(limitMessage);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks, totalBytes);
}

async function readHttpErrorDetail(response: Response): Promise<string> {
	let bytes: Buffer;
	try {
		bytes = await readBoundedBody(
			response,
			MAX_HTTP_ERROR_BYTES,
			"Local LLM error response exceeded the detail limit",
		);
	} catch (error) {
		if (
			error instanceof LocalLlmError &&
			error.message.includes("detail limit")
		) {
			return "response detail omitted because it was too large";
		}
		throw error;
	}
	return new TextDecoder().decode(bytes).replace(/\s+/g, " ").trim();
}

function serializeRequest(value: unknown): string {
	const body = JSON.stringify(value);
	if (Buffer.byteLength(body, "utf8") > MAX_LOCAL_LLM_REQUEST_BYTES) {
		throw new LocalLlmError(
			`Local LLM request exceeds the ${MAX_LOCAL_LLM_REQUEST_BYTES}-byte limit`,
		);
	}
	return body;
}

function parseJsonResponse(bytes: Buffer): unknown {
	try {
		return JSON.parse(bytes.toString("utf8"));
	} catch (error) {
		throw new LocalLlmError("Local LLM returned malformed JSON", {
			cause: error,
		});
	}
}

function mapStructureRequest(input: StructureQuestionsInput): object {
	return {
		title: input.interviewTitle,
		description: input.interviewDescription,
		notes: input.rawQuestions,
	};
}

/** Keeps one contiguous recent transcript window within the local API contract. */
function serializeTranscript(
	transcript: GenerateInterviewTurnInput["transcript"],
): string {
	if (transcript.length === 0) return "";

	const recent = [] as GenerateInterviewTurnInput["transcript"];
	for (let index = transcript.length - 1; index >= 0; index -= 1) {
		const entry = transcript[index];
		if (!entry) continue;
		const candidate = [entry, ...recent];
		if (JSON.stringify(candidate).length > MAX_TRANSCRIPT_CHARACTERS) break;
		recent.unshift(entry);
	}
	if (recent.length > 0) return JSON.stringify(recent);

	const latest = transcript.at(-1);
	if (!latest) return "";
	let minimum = 0;
	let maximum = latest.text.length;
	let result = JSON.stringify([{ ...latest, text: "" }]);
	while (minimum <= maximum) {
		const length = Math.floor((minimum + maximum) / 2);
		const candidate = JSON.stringify([
			{ ...latest, text: length === 0 ? "" : latest.text.slice(-length) },
		]);
		if (candidate.length <= MAX_TRANSCRIPT_CHARACTERS) {
			result = candidate;
			minimum = length + 1;
		} else {
			maximum = length - 1;
		}
	}
	return result;
}

function mapTurnRequest(input: GenerateInterviewTurnInput): object {
	return {
		title: input.interview.title,
		description: input.interview.description,
		candidateName: input.candidate.name,
		candidateVariationKey: input.candidate.variationKey,
		tasks: input.tasks.map((task) => ({
			id: task.id,
			title: task.title,
			prompt: task.prompt,
			objective: task.objective,
			followUpGuidance: task.followUpGuidance,
			completed: task.completed,
			turnCount: task.turnCount,
		})),
		transcript: serializeTranscript(input.transcript),
		remainingTime: input.remainingSeconds,
		mustEnd: input.mustEnd,
	};
}

@Injectable()
export class LocalLlmAdapter implements InterviewLlmPort {
	constructor(
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
	) {}

	/** Posts one bounded JSON request and never falls back to another provider. */
	private async _post(
		path: string,
		body: string,
		callerSignal?: AbortSignal,
	): Promise<Buffer> {
		const timeoutMs = this._config.get("LOCAL_LLM_TIMEOUT_MS", {
			infer: true,
		});
		const timeoutSignal = AbortSignal.timeout(timeoutMs);
		const signal = callerSignal
			? AbortSignal.any([callerSignal, timeoutSignal])
			: timeoutSignal;
		const endpoint = new URL(
			path,
			this._config.get("LOCAL_LLM_URL", { infer: true }),
		);

		try {
			const response = await fetch(endpoint.toString(), {
				body,
				headers: {
					Accept: LOCAL_LLM_RESPONSE_MIME_TYPE,
					"Content-Type": LOCAL_LLM_RESPONSE_MIME_TYPE,
				},
				method: "POST",
				signal,
			});
			if (!response.ok) {
				const detail = await readHttpErrorDetail(response);
				const statusText = response.statusText.trim().slice(0, 128);
				const status = `${response.status} ${statusText}`.trim();
				throw new LocalLlmError(
					`Local LLM request failed with HTTP ${status}${detail ? `: ${detail}` : ""}`,
				);
			}

			const mimeType = normalizeMimeType(
				response.headers.get("content-type") ?? "",
			);
			if (mimeType !== LOCAL_LLM_RESPONSE_MIME_TYPE) {
				await cancelResponseBody(response);
				throw new LocalLlmError(
					`Local LLM returned unsupported response type: ${mimeType || "missing"}`,
				);
			}
			return await readBoundedBody(
				response,
				MAX_LOCAL_LLM_RESPONSE_BYTES,
				`Local LLM response exceeds the ${MAX_LOCAL_LLM_RESPONSE_BYTES}-byte limit`,
			);
		} catch (error) {
			if (callerSignal?.aborted) {
				throw new LocalLlmError("Local LLM request was cancelled", {
					cause: error,
				});
			}
			if (timeoutSignal.aborted) {
				throw new LocalLlmError(
					`Local LLM request timed out after ${timeoutMs} ms`,
					{ cause: error },
				);
			}
			if (error instanceof LocalLlmError) throw error;
			throw new LocalLlmError(
				`Local LLM request failed: ${formatErrorCause(error)}`,
				{ cause: error },
			);
		}
	}

	/** Converts creator notes through the local service's strict task contract. */
	async structureQuestions(
		input: StructureQuestionsInput,
	): Promise<StructuredInterviewQuestion[]> {
		const response = await this._post(
			"/questions/structure",
			serializeRequest(mapStructureRequest(input)),
			input.signal,
		);
		const parsed = StructureQuestionsServiceResponseSchema.safeParse(
			parseJsonResponse(response),
		);
		if (!parsed.success) {
			throw new LocalLlmError(
				"Local LLM returned an invalid structured-question payload",
				{ cause: parsed.error },
			);
		}
		return parsed.data.tasks.map(
			({ title, prompt, objective, followUpGuidance }) => ({
				title,
				prompt,
				objective,
				followUpGuidance,
			}),
		);
	}

	/** Generates one bounded turn and verifies every action uses server task IDs. */
	async generateTurn(
		input: GenerateInterviewTurnInput,
	): Promise<GeneratedInterviewTurn> {
		const response = await this._post(
			"/interview/turn",
			serializeRequest(mapTurnRequest(input)),
			input.signal,
		);
		const parsed = InterviewTurnServiceResponseSchema.safeParse(
			parseJsonResponse(response),
		);
		if (!parsed.success) {
			throw new LocalLlmError(
				"Local LLM returned an invalid interview-turn payload",
				{ cause: parsed.error },
			);
		}

		const allowedTaskIds = new Set(input.tasks.map((task) => task.id));
		for (const action of parsed.data.actions) {
			if (
				action.type === "complete_questions" &&
				action.questionIds.some((id) => !allowedTaskIds.has(id))
			) {
				throw new LocalLlmError(
					"Local LLM returned an action for an unknown interview task",
				);
			}
		}

		return {
			text: parsed.data.text,
			actions: parsed.data.actions,
		};
	}
}
