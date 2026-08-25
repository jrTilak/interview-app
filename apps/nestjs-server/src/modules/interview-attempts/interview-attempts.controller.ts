import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
	AuthGuard,
	Session,
	type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ApiSessionAuth } from "#src/common/decorators/api-session-auth.decorator.js";
import { ApiSuccess } from "#src/common/decorators/api-success.decorator.js";
import { ApiResponse } from "#src/common/dto/api-response.dto.js";
import { InterviewIdParamsDto } from "#src/modules/interviews/dto/request.dto.js";
import { AttemptIdParamsDto } from "./dto/request.dto.js";
import {
	AttemptSnapshotResponseDto,
	CandidateInterviewHistoryResponseDto,
	CreatorAttemptHistoryResponseDto,
} from "./dto/response.dto.js";
import { InterviewAttemptsService } from "./interview-attempts.service.js";

@Controller()
@ApiTags("Interview attempts")
@ApiSessionAuth()
@UseGuards(AuthGuard)
export class InterviewAttemptsController {
	constructor(private readonly _attemptsService: InterviewAttemptsService) {}

	/** Creates a permitted attempt or resumes it by public interview UUID. */
	@Post("shared-interviews/:id/attempts")
	@ApiOperation({ summary: "Join a shared interview" })
	@ApiSuccess({
		status: 201,
		description: "Candidate attempt created or resumed.",
		type: AttemptSnapshotResponseDto,
	})
	async createOrResume(
		@Param() { id }: InterviewIdParamsDto,
		@Session() session: UserSession,
	): Promise<ApiResponse<AttemptSnapshotResponseDto>> {
		return new ApiResponse({
			data: await this._attemptsService.createOrResume(id, session.user),
		});
	}

	/** Lists all candidate-safe participant attempts for an interview creator. */
	@Get("interviews/:id/attempts")
	@ApiOperation({ summary: "List participant attempts for my interview" })
	@ApiSuccess({
		description: "Creator-owned participant attempt history.",
		type: CreatorAttemptHistoryResponseDto,
		isArray: true,
	})
	async findAttempts(
		@Param() { id }: InterviewIdParamsDto,
		@Session() session: UserSession,
	): Promise<ApiResponse<CreatorAttemptHistoryResponseDto[]>> {
		return new ApiResponse({
			data: await this._attemptsService.findAllForCreator(id, session.user),
		});
	}

	/** Lists the authenticated candidate's complete attempt history. */
	@Get("interview-attempts")
	@ApiOperation({ summary: "List my taken interview history" })
	@ApiSuccess({
		description: "Candidate attempts grouped by interview.",
		type: CandidateInterviewHistoryResponseDto,
		isArray: true,
	})
	async findAllHistory(
		@Session() session: UserSession,
	): Promise<ApiResponse<CandidateInterviewHistoryResponseDto[]>> {
		return new ApiResponse({
			data: await this._attemptsService.findAllForCandidate(session.user),
		});
	}

	/** Returns candidate-owned state and text transcript for reconnection. */
	@Get("interview-attempts/:id")
	@ApiOperation({ summary: "Get my interview attempt snapshot" })
	@ApiSuccess({
		description: "Reconnect-safe attempt state and transcript.",
		type: AttemptSnapshotResponseDto,
	})
	async findSnapshot(
		@Param() { id }: AttemptIdParamsDto,
		@Session() session: UserSession,
	): Promise<ApiResponse<AttemptSnapshotResponseDto>> {
		return new ApiResponse({
			data: await this._attemptsService.findSnapshot(id, session.user),
		});
	}
}
