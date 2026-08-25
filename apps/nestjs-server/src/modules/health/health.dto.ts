import { ApiProperty } from "@nestjs/swagger";

export class HealthResponseDto {
	@ApiProperty({ example: "interview-api" })
	service!: string;

	@ApiProperty({ example: "ok", enum: ["ok"] })
	status!: "ok";
}

export class ReadinessDependenciesDto {
	@ApiProperty({ example: "ok", enum: ["ok"] })
	database!: "ok";
}

export class ReadinessResponseDto extends HealthResponseDto {
	@ApiProperty({ type: ReadinessDependenciesDto })
	dependencies!: ReadinessDependenciesDto;
}
