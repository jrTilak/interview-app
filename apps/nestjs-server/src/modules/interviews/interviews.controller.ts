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
	AuthGuard,
	Session,
	type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ApiSessionAuth } from "../../common/decorators/api-session-auth.decorator.js";
import { ApiSuccess } from "../../common/decorators/api-success.decorator.js";
import { ApiResponse } from "../../common/dto/api-response.dto.js";
import {
	CreateInterviewDto,
	InterviewIdParamsDto,
	UpdateInterviewDto,
} from "./dto/request.dto.js";
import {
	DeletedInterviewResponseDto,
	InterviewDetailsResponseDto,
	InterviewSummaryResponseDto,
} from "./dto/response.dto.js";
import { InterviewsService } from "./interviews.service.js";

@Controller("interviews")
@ApiTags("Interviews")
@ApiSessionAuth()
@UseGuards(AuthGuard)
export class InterviewsController {
	constructor(private readonly _interviewsService: InterviewsService) {}

	/** Creates and AI-structures one immutable shareable interview. */
	@Post()
	@ApiOperation({ summary: "Create and structure an interview" })
	@ApiSuccess({
		status: 201,
		description: "Interview and structured questions created.",
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

	/** Lists the authenticated creator's interviews and reusable share URLs. */
	@Get()
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

	/** Returns raw and structured questions only to the interview creator. */
	@Get(":id")
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

	/** Updates mutable interview metadata without rewriting attempt history. */
	@Patch(":id")
	@ApiOperation({ summary: "Update one of my interviews" })
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

	/** Deletes an unused creator-owned interview and its question set. */
	@Delete(":id")
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
}
