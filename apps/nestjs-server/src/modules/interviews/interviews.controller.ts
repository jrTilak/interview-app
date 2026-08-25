import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
	AllowAnonymous,
	AuthGuard,
	Session,
	type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ApiSessionAuth } from "#/common/decorators/api-session-auth.decorator.js";
import { ApiSuccess } from "#/common/decorators/api-success.decorator.js";
import { ApiResponse } from "#/common/dto/api-response.dto.js";
import {
	CreateInterviewDto,
	InterviewIdParamsDto,
	UpdateInterviewDto,
} from "./dto/request.dto.js";
import {
	DeletedInterviewResponseDto,
	InterviewDetailsResponseDto,
	InterviewSummaryResponseDto,
	SharedInterviewPreviewResponseDto,
} from "./dto/response.dto.js";
import { InterviewsService } from "./interviews.service.js";

@Controller()
@ApiTags("Interviews")
@UseGuards(AuthGuard)
export class InterviewsController {
	constructor(private readonly _interviewsService: InterviewsService) {}

	/** Creates one private interview with an AI-structured topic plan. */
	@Post("interviews")
	@ApiSessionAuth()
	@ApiOperation({ summary: "Create and structure an interview" })
	@ApiSuccess({
		status: 201,
		description: "Interview and structured topic plan created.",
		type: InterviewDetailsResponseDto,
	})
	async create(
		@Body() data: CreateInterviewDto,
		@Session() session: UserSession,
	): Promise<ApiResponse<InterviewDetailsResponseDto>> {
		return new ApiResponse({
			data: await this._interviewsService.create(data, session.user),
		});
	}

	/** Lists the authenticated creator's interviews. */
	@Get("interviews")
	@ApiSessionAuth()
	@ApiOperation({ summary: "List my created interviews" })
	@ApiSuccess({
		description: "Creator-owned interviews.",
		type: InterviewSummaryResponseDto,
		isArray: true,
	})
	async findAll(
		@Session() session: UserSession,
	): Promise<ApiResponse<InterviewSummaryResponseDto[]>> {
		return new ApiResponse({
			data: await this._interviewsService.findAllOwned(session.user),
		});
	}

	/** Returns private topic notes and the structured plan only to its creator. */
	@Get("interviews/:id")
	@ApiSessionAuth()
	@ApiOperation({ summary: "Get one of my created interviews" })
	@ApiSuccess({
		description: "Creator-owned interview details.",
		type: InterviewDetailsResponseDto,
	})
	async findById(
		@Param() { id }: InterviewIdParamsDto,
		@Session() session: UserSession,
	): Promise<ApiResponse<InterviewDetailsResponseDto>> {
		return new ApiResponse({
			data: await this._interviewsService.findOwnedById(id, session.user),
		});
	}

	/** Updates owner-controlled metadata and public visibility. */
	@Patch("interviews/:id")
	@ApiSessionAuth()
	@ApiOperation({ summary: "Update or publish one of my interviews" })
	@ApiSuccess({
		description: "Updated creator-owned interview.",
		type: InterviewDetailsResponseDto,
	})
	async update(
		@Param() { id }: InterviewIdParamsDto,
		@Body() data: UpdateInterviewDto,
		@Session() session: UserSession,
	): Promise<ApiResponse<InterviewDetailsResponseDto>> {
		return new ApiResponse({
			data: await this._interviewsService.update(id, data, session.user),
		});
	}

	/** Deletes an unused creator-owned interview and its topic plan. */
	@Delete("interviews/:id")
	@ApiSessionAuth()
	@ApiOperation({ summary: "Delete one of my unused interviews" })
	@ApiSuccess({
		description: "Deleted creator-owned interview.",
		type: DeletedInterviewResponseDto,
	})
	async remove(
		@Param() { id }: InterviewIdParamsDto,
		@Session() session: UserSession,
	): Promise<ApiResponse<DeletedInterviewResponseDto>> {
		return new ApiResponse({
			data: await this._interviewsService.remove(id, session.user),
		});
	}

	/** Returns candidate-safe metadata for a public interview UUID. */
	@Get("shared-interviews/:id")
	@AllowAnonymous()
	@ApiOperation({ summary: "Preview a public interview", security: [] })
	@ApiSuccess({
		description: "Safe preview without hidden question content.",
		type: SharedInterviewPreviewResponseDto,
	})
	async preview(
		@Param() { id }: InterviewIdParamsDto,
	): Promise<ApiResponse<SharedInterviewPreviewResponseDto>> {
		return new ApiResponse({
			data: await this._interviewsService.findSharedPreview(id),
		});
	}
}
