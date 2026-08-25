import {
	ConflictException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import type { User } from "better-auth/types";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { type AppDatabase, InjectDatabase } from "#/db/database.provider.js";
import {
	interview,
	interviewAttempt,
	interviewQuestion,
} from "#/db/schema/index.js";
import {
	INTERVIEW_LLM,
	type InterviewLlmPort,
	type StructuredInterviewQuestion,
} from "#/modules/ai/llm/llm.port.js";
import type {
	CreateInterviewDto,
	UpdateInterviewDto,
} from "./dto/request.dto.js";
import type {
	InterviewDetailsResponseDto,
	InterviewSummaryResponseDto,
	SharedInterviewPreviewResponseDto,
} from "./dto/response.dto.js";

@Injectable()
export class InterviewsService {
	private readonly _logger = new Logger(InterviewsService.name);

	constructor(
		@InjectDatabase()
		private readonly _database: AppDatabase,
		@Inject(INTERVIEW_LLM)
		private readonly _llm: InterviewLlmPort,
	) {}

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
				isPublic: interview.isPublic,
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
			createdAt: row.createdAt.toISOString(),
			questions,
		};
	}

	/** Creates a private interview after the provider structures its topic notes. */
	async create(
		data: CreateInterviewDto,
		user: User,
	): Promise<InterviewDetailsResponseDto> {
		let structuredQuestions: StructuredInterviewQuestion[];
		try {
			structuredQuestions = await this._llm.structureQuestions({
				interviewTitle: data.title,
				interviewDescription: data.description ?? null,
				rawQuestions: data.rawQuestions,
			});
		} catch (error) {
			this._logger.error("Interview topic structuring failed", error);
			throw new ServiceUnavailableException(
				"The interview topics could not be prepared. Please retry.",
			);
		}

		const id = await this._database.transaction(async (transaction) => {
			const [created] = await transaction
				.insert(interview)
				.values({
					createdById: user.id,
					title: data.title,
					description: data.description ?? null,
					rawQuestions: data.rawQuestions,
					durationMinutes: data.durationMinutes,
					allowMultipleAttempts: data.allowMultipleAttempts,
				})
				.returning({ id: interview.id });
			if (!created) {
				throw new ServiceUnavailableException("Interview could not be created");
			}

			await transaction.insert(interviewQuestion).values(
				structuredQuestions.map((question, index) => ({
					interviewId: created.id,
					position: index + 1,
					...question,
				})),
			);
			return created.id;
		});

		const details = await this._findOwnedDetails(id, user.id);
		if (!details)
			throw new ServiceUnavailableException("Interview could not be loaded");
		return details;
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
				isPublic: interview.isPublic,
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

	/** Returns safe metadata only when the UUID identifies a public interview. */
	async findSharedPreview(
		id: string,
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
			.where(and(eq(interview.id, id), eq(interview.isPublic, true)))
			.groupBy(interview.id)
			.limit(1);
		if (!row) throw new NotFoundException("Shared interview does not exist");
		return { ...row, questionCount: Number(row.questionCount) };
	}
}
