import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { ApiSuccess } from "../../common/decorators/api-success.decorator.js";
import { ApiResponse } from "../../common/dto/api-response.dto.js";
import { HealthResponseDto, ReadinessResponseDto } from "./health.dto.js";
import { HealthService } from "./health.service.js";

@Controller()
@ApiTags("Health")
export class HealthController {
	constructor(private readonly _healthService: HealthService) {}

	/** Exposes a dependency-light public liveness check. */
	@Get()
	@AllowAnonymous()
	@ApiOperation({ summary: "Check API liveness" })
	@ApiSuccess({
		description: "API process is healthy.",
		type: HealthResponseDto,
	})
	health(): ApiResponse<HealthResponseDto> {
		return new ApiResponse({ data: this._healthService.health() });
	}

	/** Exposes readiness only while required infrastructure is reachable. */
	@Get("ready")
	@AllowAnonymous()
	@ApiOperation({ summary: "Check API and database readiness" })
	@ApiSuccess({
		description: "API and PostgreSQL are ready.",
		type: ReadinessResponseDto,
	})
	async readiness(): Promise<ApiResponse<ReadinessResponseDto>> {
		return new ApiResponse({ data: await this._healthService.readiness() });
	}
}
