import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
	AuthGuard,
	Session,
	type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ApiSessionAuth } from "../../common/decorators/api-session-auth.decorator.js";
import { ApiSuccess } from "../../common/decorators/api-success.decorator.js";
import { ApiResponse } from "../../common/dto/api-response.dto.js";
import { ShareCodeParamsDto } from "../interviews/dto/request.dto.js";
import { AttemptIdParamsDto } from "./dto/request.dto.js";
import { AttemptSnapshotResponseDto } from "./dto/response.dto.js";
import { InterviewAttemptsService } from "./interview-attempts.service.js";

@Controller()
@ApiTags("Interview attempts")
@ApiSessionAuth()
@UseGuards(AuthGuard)
export class InterviewAttemptsController {
	constructor(private readonly _attemptsService: InterviewAttemptsService) {}

	/** Creates or resumes the authenticated candidate's one attempt per link. */
	@Post("shared-interviews/:shareCode/attempts")
	@ApiOperation({ summary: "Join a shared interview" })
	@ApiSuccess({
		status: 201,
		description: "Candidate attempt created or resumed.",
		type: AttemptSnapshotResponseDto,
	})
	async createOrResume(
		@Param() { shareCode }: ShareCodeParamsDto,
		@Session() session: UserSession,
	): Promise<ApiResponse<AttemptSnapshotResponseDto>> {
		return new ApiResponse({
			data: await this._attemptsService.createOrResume(shareCode, session.user),
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
