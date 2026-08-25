import { applyDecorators } from "@nestjs/common";
import { ApiCookieAuth, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { ApiErrorResponseDto } from "#/common/dto/api-response.dto.js";

/** Documents Better Auth cookie protection for one controller or route. */
export function ApiSessionAuth() {
	return applyDecorators(
		ApiCookieAuth("betterAuthSession"),
		ApiUnauthorizedResponse({
			description: "Authentication is required.",
			type: ApiErrorResponseDto,
		}),
	);
}
