import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { AppService } from "./app.service.js";
import { ApiSuccess } from "./common/decorators/api-success.decorator.js";
import { ApiResponse } from "./common/dto/api-response.dto.js";

class HealthResponseDto {
	@ApiProperty({ example: "interview-api" })
	service!: string;

	@ApiProperty({ example: "ok", enum: ["ok"] })
	status!: "ok";
}

class ReadinessDependenciesDto {
	@ApiProperty({ example: "ok", enum: ["ok"] })
	database!: "ok";
}

class ReadinessResponseDto extends HealthResponseDto {
	@ApiProperty({ type: ReadinessDependenciesDto })
	dependencies!: ReadinessDependenciesDto;
}

@Controller()
@ApiTags("Health")
export class AppController {
	constructor(private readonly _appService: AppService) {}

	/** Exposes a dependency-light public liveness check. */
	@Get()
	@AllowAnonymous()
	@ApiOperation({ summary: "Check API liveness" })
	@ApiSuccess({
		description: "API process is healthy.",
		type: HealthResponseDto,
	})
	health(): ApiResponse<HealthResponseDto> {
		return new ApiResponse({ data: this._appService.health() });
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
		return new ApiResponse({ data: await this._appService.readiness() });
	}
}
