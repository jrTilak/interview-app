import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { ApiResponseShape } from "#src/common/dto/api-response.dto.js";

/** Returns the conventional success message for one HTTP method. */
function defaultMessage(method: string): string {
	if (method === "POST") return "Created successfully";
	if (method === "PATCH" || method === "PUT") return "Updated successfully";
	if (method === "DELETE") return "Deleted successfully";
	return "Retrieved successfully";
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
	/** Wraps successful JSON payloads in the stable public API envelope. */
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		return next.handle().pipe(
			map((payload: ApiResponseShape | undefined) => {
				const request = context.switchToHttp().getRequest<{ method: string }>();
				return {
					message: payload?.message ?? defaultMessage(request.method),
					...(payload?.data === undefined ? {} : { data: payload.data }),
				};
			}),
		);
	}
}
