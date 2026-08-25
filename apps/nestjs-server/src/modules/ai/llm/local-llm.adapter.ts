import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import z from "zod";
import { AiHttpService } from "#/modules/ai/ai-http.service.js";
import type { AppConfigService } from "#/types/index.js";
import type {
	GeneratedInterviewTurn,
	GenerateInterviewTurnInput,
	InterviewLlmPort,
	StructuredInterviewQuestion,
	StructureQuestionsInput,
} from "./llm.port.js";

@Injectable()
export class LocalLlmAdapter implements InterviewLlmPort {
	private static readonly _NAME = "Local LLM";
	private static readonly _RESPONSE_MIME_TYPE = "application/json";
	private static readonly _MAX_REQUEST_BYTES = 512 * 1024;
	private static readonly _MAX_RESPONSE_BYTES = 512 * 1024;
	private static readonly _MAX_TRANSCRIPT_CHARACTERS = 20_000;

	private static readonly _STRUCTURE_RESPONSE_SCHEMA = z
		.object({
			tasks: z
				.array(
					z
						.object({
							title: z.string().trim().min(1).max(160),
							prompt: z.string().trim().min(1).max(4_000),
							objective: z.string().trim().min(1).max(2_000).nullable(),
							followUpGuidance: z.string().trim().min(1).max(2_000).nullable(),
						})
						.strict(),
				)
				.min(1)
				.max(30),
		})
		.strict();

	private static readonly _TURN_RESPONSE_SCHEMA = z
		.object({
			text: z.string().trim().min(1).max(4_000),
			actions: z
				.array(
					z.discriminatedUnion("type", [
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
					]),
				)
				.max(30),
		})
		.strict();

	constructor(
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
		@Inject(AiHttpService)
		private readonly _http: AiHttpService,
	) {}

	async structureQuestions(
		input: StructureQuestionsInput,
	): Promise<StructuredInterviewQuestion[]> {
		const response = await this._requestJson(
			"/questions/structure",
			this._mapStructureRequest(input),
			input.signal,
		);
		const parsed =
			LocalLlmAdapter._STRUCTURE_RESPONSE_SCHEMA.safeParse(response);
		if (!parsed.success) {
			throw this._http.error(
				LocalLlmAdapter._NAME,
				"returned an invalid structured-question payload",
				parsed.error,
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

	async generateTurn(
		input: GenerateInterviewTurnInput,
	): Promise<GeneratedInterviewTurn> {
		const response = await this._requestJson(
			"/interview/turn",
			this._mapTurnRequest(input),
			input.signal,
		);
		const parsed = LocalLlmAdapter._TURN_RESPONSE_SCHEMA.safeParse(response);
		if (!parsed.success) {
			throw this._http.error(
				LocalLlmAdapter._NAME,
				"returned an invalid interview-turn payload",
				parsed.error,
			);
		}

		this._assertKnownTaskIds(parsed.data.actions, input.tasks);
		return {
			text: parsed.data.text,
			actions: parsed.data.actions,
		};
	}

	private async _requestJson(
		path: string,
		body: unknown,
		signal?: AbortSignal,
	): Promise<unknown> {
		const response = await this._http.post({
			name: LocalLlmAdapter._NAME,
			url: new URL(path, this._config.get("LOCAL_LLM_URL", { infer: true })),
			body: this._serializeRequest(body),
			headers: {
				Accept: LocalLlmAdapter._RESPONSE_MIME_TYPE,
				"Content-Type": LocalLlmAdapter._RESPONSE_MIME_TYPE,
			},
			timeoutMs: this._config.get("LOCAL_LLM_TIMEOUT_MS", { infer: true }),
			signal,
			expectedMimeType: LocalLlmAdapter._RESPONSE_MIME_TYPE,
			responseType: "response type",
			maximumBytes: LocalLlmAdapter._MAX_RESPONSE_BYTES,
			limitMessage: `response exceeds the ${LocalLlmAdapter._MAX_RESPONSE_BYTES}-byte limit`,
		});
		return this._http.parseJson(LocalLlmAdapter._NAME, response.bytes);
	}

	private _serializeRequest(value: unknown): string {
		const body = JSON.stringify(value);
		if (Buffer.byteLength(body, "utf8") > LocalLlmAdapter._MAX_REQUEST_BYTES) {
			throw this._http.error(
				LocalLlmAdapter._NAME,
				`request exceeds the ${LocalLlmAdapter._MAX_REQUEST_BYTES}-byte limit`,
			);
		}
		return body;
	}

	private _mapStructureRequest(input: StructureQuestionsInput): object {
		return {
			title: input.interviewTitle,
			description: input.interviewDescription,
			notes: input.rawQuestions,
		};
	}

	private _mapTurnRequest(input: GenerateInterviewTurnInput): object {
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
			transcript: this._serializeTranscript(input.transcript),
			remainingTime: input.remainingSeconds,
			mustEnd: input.mustEnd,
		};
	}

	/** Keeps the newest contiguous transcript window accepted by the service. */
	private _serializeTranscript(
		transcript: GenerateInterviewTurnInput["transcript"],
	): string {
		if (transcript.length === 0) return "";

		const recent: GenerateInterviewTurnInput["transcript"] = [];
		for (let index = transcript.length - 1; index >= 0; index -= 1) {
			const entry = transcript[index];
			if (!entry) continue;
			const candidate = [entry, ...recent];
			if (
				JSON.stringify(candidate).length >
				LocalLlmAdapter._MAX_TRANSCRIPT_CHARACTERS
			) {
				break;
			}
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
			if (candidate.length <= LocalLlmAdapter._MAX_TRANSCRIPT_CHARACTERS) {
				result = candidate;
				minimum = length + 1;
			} else {
				maximum = length - 1;
			}
		}
		return result;
	}

	/** Prevents model actions from escaping the server-supplied task boundary. */
	private _assertKnownTaskIds(
		actions: GeneratedInterviewTurn["actions"],
		tasks: GenerateInterviewTurnInput["tasks"],
	): void {
		const allowedTaskIds = new Set(tasks.map((task) => task.id));
		for (const action of actions) {
			if (
				action.type === "complete_questions" &&
				action.questionIds.some((id) => !allowedTaskIds.has(id))
			) {
				throw this._http.error(
					LocalLlmAdapter._NAME,
					"returned an action for an unknown interview task",
				);
			}
		}
	}
}
