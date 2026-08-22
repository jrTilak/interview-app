import {
	Body,
	Controller,
	Get,
	Inject,
	NotFoundException,
	Patch,
	UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@thallesp/nestjs-better-auth";
import { ApiSessionAuth } from "../../common/decorators/api-session-auth.decorator.js";
import { ApiSuccess } from "../../common/decorators/api-success.decorator.js";
import { ApiResponse } from "../../common/dto/api-response.dto.js";
import type { AppConfigService } from "../../types/index.js";
import { DevFlagsResponseDto, UpdateDevFlagsDto } from "./dev-flags.dto.js";
import { DevFlagsService } from "./dev-flags.service.js";

@Controller("__flags__")
@ApiTags("Development flags")
@ApiSessionAuth()
@UseGuards(AuthGuard)
export class DevFlagsController {
	constructor(
		private readonly _flags: DevFlagsService,
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
	) {}

	private _assertEnabled(): void {
		if (!this._config.get("DEV_TOOLS_ENABLED", { infer: true })) {
			throw new NotFoundException("Development tools are disabled");
		}
	}

	@Get()
	@ApiOperation({ summary: "Read process-wide development flags" })
	@ApiSuccess({
		description: "Current global flags.",
		type: DevFlagsResponseDto,
	})
	read(): ApiResponse<DevFlagsResponseDto> {
		this._assertEnabled();
		return new ApiResponse({ data: this._flags.get() });
	}

	@Patch()
	@ApiOperation({ summary: "Update process-wide development flags" })
	@ApiSuccess({
		description: "Updated global flags.",
		type: DevFlagsResponseDto,
	})
	update(@Body() changes: UpdateDevFlagsDto): ApiResponse<DevFlagsResponseDto> {
		this._assertEnabled();
		return new ApiResponse({ data: this._flags.update(changes) });
	}
}
