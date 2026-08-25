import { randomBytes } from "node:crypto";
import {
	ConflictException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { User } from "better-auth/types";
import { and, asc, count, desc, eq } from "drizzle-orm";
import z from "zod";
import {
	type AppDatabase,
	InjectDatabase,
} from "../../db/database.provider.js";
import {
	interview,
	interviewAttempt,
	interviewQuestion,
} from "../../db/schema/index.js";
import type { AppConfigService } from "../../types/index.js";
import { INTERVIEW_LLM, type InterviewLlmPort } from "../ai/ai.ports.js";
import type {
	CreateInterviewDto,
	UpdateInterviewDto,
} from "./dto/request.dto.js";
import type {
	InterviewDetailsResponseDto,
	InterviewSummaryResponseDto,
	SharedInterviewPreviewResponseDto,
} from "./dto/response.dto.js";
import { INTERVIEW_LIMITS } from "./interview.constants.js";
import { InterviewCreationLimiterService } from "./interview-creation-limiter.service.js";

const StructuredQuestionSchema = z
	.object({
		title: z.string().trim().min(1).max(160),
		prompt: z.string().trim().min(1).max(4_000),
		objective: z.string().trim().min(1).max(2_000).nullable(),
		followUpGuidance: z.string().trim().min(1).max(2_000).nullable(),
	})
	.strict();

const StructuredQuestionsSchema = z
	.array(StructuredQuestionSchema)
	.min(INTERVIEW_LIMITS.structuredQuestions.minimum)
	.max(INTERVIEW_LIMITS.structuredQuestions.maximum);

@Injectable()
export class InterviewsService {
	private readonly _logger = new Logger(InterviewsService.name);

	constructor(
		@InjectDatabase()
		private readonly _database: AppDatabase,
		@Inject(INTERVIEW_LLM)
		private readonly _llm: InterviewLlmPort,
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
		private readonly _creationLimiter: InterviewCreationLimiterService,
	) {}

	/** Builds the browser-facing share URL without exposing server routing details. */
	private _shareUrl(shareCode: string): string {
		const webUrl = this._config
			.get("APP_WEB_URL", { infer: true })
			.replace(/\/$/, "");
		return `${webUrl}/interviews/${shareCode}`;
	}

	/** Loads one creator-owned interview and its ordered topic plan. */
	private async _findOwnedDetails(
		id: string,
		ownerId: string,
	): Promise<InterviewDetailsResponseDto | null> {
		const [row] = await this._database
			.select({
				id: interview.id,
				title: interview.title,
				description: interview.description,
				rawQuestions: interview.rawQuestions,
				durationMinutes: interview.durationMinutes,
				allowMultipleAttempts: interview.allowMultipleAttempts,
				shareCode: interview.shareCode,
				createdAt: interview.createdAt,
			})
			.from(interview)
			.where(and(eq(interview.id, id), eq(interview.createdById, ownerId)))
			.limit(1);
		if (!row) return null;

		const questions = await this._database
			.select({
				id: interviewQuestion.id,
				position: interviewQuestion.position,
				title: interviewQuestion.title,
				prompt: interviewQuestion.prompt,
				objective: interviewQuestion.objective,
				followUpGuidance: interviewQuestion.followUpGuidance,
			})
			.from(interviewQuestion)
			.where(eq(interviewQuestion.interviewId, row.id))
			.orderBy(asc(interviewQuestion.position));

		return {
			...row,
			questionCount: questions.length,
			shareUrl: this._shareUrl(row.shareCode),
			createdAt: row.createdAt.toISOString(),
			questions,
		};
	}

	/** Performs one interview creation inside the per-user single-flight boundary. */
	private async _create(
		data: CreateInterviewDto,
		user: User,
	): Promise<InterviewDetailsResponseDto> {
		const [existing] = await this._database
			.select({ id: interview.id })
			.from(interview)
			.where(
				and(
					eq(interview.createdById, user.id),
					eq(interview.clientRequestId, data.clientRequestId),
				),
			)
			.limit(1);
		if (existing) {
			const details = await this._findOwnedDetails(existing.id, user.id);
			if (details) return details;
		}

		let structuredQuestions: z.infer<typeof StructuredQuestionsSchema>;
		try {
			structuredQuestions = StructuredQuestionsSchema.parse(
				await this._llm.structureQuestions({
					interviewTitle: data.title,
					interviewDescription: data.description ?? null,
					rawQuestions: data.rawQuestions,
				}),
			);
		} catch (error) {
			this._logger.error("Interview topic structuring failed", error);
			throw new ServiceUnavailableException(
				"The interview topics could not be prepared. Please retry.",
			);
		}

		const shareCode = randomBytes(24).toString("base64url");
		const createdId = await this._database.transaction(async (transaction) => {
			const [created] = await transaction
				.insert(interview)
				.values({
					createdById: user.id,
					clientRequestId: data.clientRequestId,
					title: data.title,
					description: data.description ?? null,
					rawQuestions: data.rawQuestions,
					durationMinutes: data.durationMinutes,
					allowMultipleAttempts: data.allowMultipleAttempts,
					shareCode,
				})
				.onConflictDoNothing({
					target: [interview.createdById, interview.clientRequestId],
				})
				.returning({ id: interview.id });
			if (!created) return null;

			await transaction.insert(interviewQuestion).values(
				structuredQuestions.map((question, index) => ({
					interviewId: created.id,
					position: index + 1,
					...question,
				})),
			);
			return created.id;
		});

		const id =
			createdId ??
			(
				await this._database
					.select({ id: interview.id })
					.from(interview)
					.where(
						and(
							eq(interview.createdById, user.id),
							eq(interview.clientRequestId, data.clientRequestId),
						),
					)
					.limit(1)
			)[0]?.id;
		if (!id)
			throw new ServiceUnavailableException("Interview could not be created");

		const details = await this._findOwnedDetails(id, user.id);
		if (!details)
			throw new ServiceUnavailableException("Interview could not be loaded");
		return details;
	}

	/** Creates an interview after the provider structures its raw topic notes. */
	create(
		data: CreateInterviewDto,
		user: User,
	): Promise<InterviewDetailsResponseDto> {
		return this._creationLimiter.run(user.id, data.clientRequestId, () =>
			this._create(data, user),
		);
	}

	/** Returns all interviews created by the authenticated user. */
	async findAllOwned(user: User): Promise<InterviewSummaryResponseDto[]> {
		const rows = await this._database
			.select({
				id: interview.id,
				title: interview.title,
				description: interview.description,
				durationMinutes: interview.durationMinutes,
				allowMultipleAttempts: interview.allowMultipleAttempts,
				shareCode: interview.shareCode,
				createdAt: interview.createdAt,
				questionCount: count(interviewQuestion.id),
			})
			.from(interview)
			.leftJoin(
				interviewQuestion,
				eq(interviewQuestion.interviewId, interview.id),
			)
			.where(eq(interview.createdById, user.id))
			.groupBy(interview.id)
			.orderBy(desc(interview.createdAt));

		return rows.map((row) => ({
			...row,
			questionCount: Number(row.questionCount),
			shareUrl: this._shareUrl(row.shareCode),
			createdAt: row.createdAt.toISOString(),
		}));
	}

	/** Returns one creator-owned interview, hiding foreign IDs as not found. */
	async findOwnedById(
		id: string,
		user: User,
	): Promise<InterviewDetailsResponseDto> {
		const interviewDetails = await this._findOwnedDetails(id, user.id);
		if (!interviewDetails) {
			throw new NotFoundException(
				"Interview does not exist or is not owned by the current user",
			);
		}
		return interviewDetails;
	}

	/** Updates creator-controlled metadata while preserving question/attempt IDs. */
	async update(
		id: string,
		data: UpdateInterviewDto,
		user: User,
	): Promise<InterviewDetailsResponseDto> {
		const [updated] = await this._database
			.update(interview)
			.set(data)
			.where(and(eq(interview.id, id), eq(interview.createdById, user.id)))
			.returning({ id: interview.id });
		if (!updated) {
			throw new NotFoundException(
				"Interview does not exist or is not owned by the current user",
			);
		}
		return this.findOwnedById(updated.id, user);
	}

	/** Deletes only interviews without attempts so candidate history stays intact. */
	async remove(id: string, user: User): Promise<{ id: string }> {
		const [owned] = await this._database
			.select({ id: interview.id })
			.from(interview)
			.where(and(eq(interview.id, id), eq(interview.createdById, user.id)))
			.limit(1);
		if (!owned) {
			throw new NotFoundException(
				"Interview does not exist or is not owned by the current user",
			);
		}

		const [usage] = await this._database
			.select({ count: count() })
			.from(interviewAttempt)
			.where(eq(interviewAttempt.interviewId, id));
		if (Number(usage?.count ?? 0) > 0) {
			throw new ConflictException(
				"Interviews with candidate attempts cannot be deleted",
			);
		}

		await this._database
			.delete(interview)
			.where(and(eq(interview.id, id), eq(interview.createdById, user.id)));
		return { id };
	}

	/** Returns safe share-link metadata without exposing hidden questions. */
	async findSharedPreview(
		shareCode: string,
	): Promise<SharedInterviewPreviewResponseDto> {
		const [row] = await this._database
			.select({
				title: interview.title,
				description: interview.description,
				durationMinutes: interview.durationMinutes,
				allowMultipleAttempts: interview.allowMultipleAttempts,
				questionCount: count(interviewQuestion.id),
			})
			.from(interview)
			.leftJoin(
				interviewQuestion,
				eq(interviewQuestion.interviewId, interview.id),
			)
			.where(eq(interview.shareCode, shareCode))
			.groupBy(interview.id)
			.limit(1);
		if (!row) throw new NotFoundException("Shared interview does not exist");
		return { ...row, questionCount: Number(row.questionCount) };
	}
}
