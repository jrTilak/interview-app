import { ApiResponse } from "./api-response.dto.js";

describe("ApiResponse", () => {
	it("retains explicitly supplied data and message values", () => {
		expect(new ApiResponse({ data: 0, message: "Done" })).toEqual({
			data: 0,
			message: "Done",
		});
		expect(new ApiResponse({ data: null })).toEqual({
			data: null,
			message: undefined,
		});
	});

	it("creates an empty response marker when no shape is supplied", () => {
		expect(new ApiResponse()).toEqual({
			data: undefined,
			message: undefined,
		});
	});
});
