import { jest } from "@jest/globals";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of, throwError } from "rxjs";
import { ApiResponse } from "#/common/dto/api-response.dto.js";
import { ApiResponseInterceptor } from "./api-response.interceptor.js";

function context(method: string): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => ({ method }),
		}),
	} as unknown as ExecutionContext;
}

function handler(payload: unknown): CallHandler {
	return { handle: jest.fn(() => of(payload)) };
}

describe("ApiResponseInterceptor", () => {
	it.each([
		["GET", "Retrieved successfully"],
		["POST", "Created successfully"],
		["PATCH", "Updated successfully"],
		["PUT", "Updated successfully"],
		["DELETE", "Deleted successfully"],
		["OPTIONS", "Retrieved successfully"],
	])("uses the expected default message for %s", async (method, message) => {
		const interceptor = new ApiResponseInterceptor();

		await expect(
			firstValueFrom(
				interceptor.intercept(
					context(method),
					handler(new ApiResponse({ data: { ok: true } })),
				),
			),
		).resolves.toEqual({ message, data: { ok: true } });
	});

	it("uses a controller message and omits only undefined data", async () => {
		const interceptor = new ApiResponseInterceptor();

		await expect(
			firstValueFrom(
				interceptor.intercept(
					context("GET"),
					handler(new ApiResponse({ message: "Custom" })),
				),
			),
		).resolves.toEqual({ message: "Custom" });
		for (const data of [null, false, 0, ""] as const) {
			await expect(
				firstValueFrom(
					interceptor.intercept(
						context("GET"),
						handler(new ApiResponse({ data })),
					),
				),
			).resolves.toEqual({ message: "Retrieved successfully", data });
		}
	});

	it("does not replace an error from the route handler", async () => {
		const failure = new Error("route failed");
		const interceptor = new ApiResponseInterceptor();
		const next = { handle: () => throwError(() => failure) };

		await expect(
			firstValueFrom(interceptor.intercept(context("GET"), next)),
		).rejects.toBe(failure);
	});
});
