import { applyDecorators, type Type } from "@nestjs/common";
import {
	ApiExtraModels,
	getSchemaPath,
	ApiResponse as SwaggerApiResponse,
} from "@nestjs/swagger";
import { ApiSuccessResponseDto } from "#src/common/dto/api-response.dto.js";

type ApiSuccessOptions = {
	description: string;
	isArray?: boolean;
	status?: number;
	type?: Type<unknown>;
};

/** Documents the application's shared success envelope and typed `data`. */
export function ApiSuccess(options: ApiSuccessOptions) {
	const dataSchema = options.type
		? options.isArray
			? { type: "array", items: { $ref: getSchemaPath(options.type) } }
			: { $ref: getSchemaPath(options.type) }
		: undefined;

	return applyDecorators(
		ApiExtraModels(
			ApiSuccessResponseDto,
			...(options.type ? [options.type] : []),
		),
		SwaggerApiResponse({
			status: options.status ?? 200,
			description: options.description,
			schema: {
				allOf: [
					{ $ref: getSchemaPath(ApiSuccessResponseDto) },
					...(dataSchema
						? [
								{
									type: "object",
									required: ["data"],
									properties: { data: dataSchema },
								},
							]
						: []),
				],
			},
		}),
	);
}
