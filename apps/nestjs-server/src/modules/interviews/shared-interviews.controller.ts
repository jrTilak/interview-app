import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@thallesp/nestjs-better-auth";
import { ApiSessionAuth } from "../../common/decorators/api-session-auth.decorator.js";
import { ApiSuccess } from "../../common/decorators/api-success.decorator.js";
import { ApiResponse } from "../../common/dto/api-response.dto.js";
import { ShareCodeParamsDto } from "./dto/request.dto.js";
import { SharedInterviewPreviewResponseDto } from "./dto/response.dto.js";
import { InterviewsService } from "./interviews.service.js";

@Controller("shared-interviews")
@ApiTags("Shared interviews")
@ApiSessionAuth()
@UseGuards(AuthGuard)
export class SharedInterviewsController {
	constructor(private readonly _interviewsService: InterviewsService) {}

	/** Returns authenticated candidate-safe metadata for one share link. */
	@Get(":shareCode")
	@ApiOperation({ summary: "Preview a shared interview" })
	@ApiSuccess({
		description: "Safe preview without hidden question content.",
		type: SharedInterviewPreviewResponseDto,
	})
	async preview(
		@Param() { shareCode }: ShareCodeParamsDto,
	): Promise<ApiResponse<SharedInterviewPreviewResponseDto>> {
		return new ApiResponse({
			data: await this._interviewsService.findSharedPreview(shareCode),
		});
	}
}
