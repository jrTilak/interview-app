import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ApiErrorResponseDto {
	@ApiProperty({ example: "Input validation failed" })
	message!: string;

	@ApiPropertyOptional({ nullable: true })
	error?: unknown;
}

export class ApiSuccessResponseDto {
	@ApiProperty({ example: "Retrieved successfully" })
	message!: string;

	@ApiPropertyOptional()
	data?: unknown;
}

export type ApiResponseShape<T = undefined> = {
	data?: T;
	message?: string;
};

/** Controller response marker consumed by the global response interceptor. */
export class ApiResponse<T = undefined> {
	data?: T;
	message?: string;

	constructor(response?: ApiResponseShape<T>) {
		this.data = response?.data;
		this.message = response?.message;
	}
}
