import { jest } from "@jest/globals";
import {
	type ArgumentsHost,
	BadRequestException,
	HttpException,
	InternalServerErrorException,
	UnprocessableEntityException,
} from "@nestjs/common";
import { ApiExceptionFilter } from "./api-exception.filter.js";

type ResponseDouble = {
	status: jest.Mock;
	json: jest.Mock;
};

function host(): { argumentsHost: ArgumentsHost; response: ResponseDouble } {
	const response = {
		status: jest.fn(),
		json: jest.fn(),
	};
	response.status.mockReturnValue(response);
	return {
		argumentsHost: {
			switchToHttp: () => ({ getResponse: () => response }),
		} as unknown as ArgumentsHost,
		response,
	};
}

describe("ApiExceptionFilter", () => {
	it("keeps safe client-error messages and details", () => {
		const { argumentsHost, response } = host();
		const exception = new UnprocessableEntityException({
			message: ["title is required", "duration is invalid"],
			error: [{ path: ["title"] }],
		});

		new ApiExceptionFilter().catch(exception, argumentsHost);

		expect(response.status).toHaveBeenCalledWith(422);
		expect(response.json).toHaveBeenCalledWith({
			message: "title is required, duration is invalid",
			error: [{ path: ["title"] }],
		});
	});

	it("supports string and ordinary object HttpException responses", () => {
		const stringHost = host();
		new ApiExceptionFilter().catch(
			new HttpException("Teapot", 418),
			stringHost.argumentsHost,
		);
		expect(stringHost.response.status).toHaveBeenCalledWith(418);
		expect(stringHost.response.json).toHaveBeenCalledWith({
			message: "Teapot",
			error: null,
		});

		const objectHost = host();
		new ApiExceptionFilter().catch(
			new BadRequestException("Malformed request"),
			objectHost.argumentsHost,
		);
		expect(objectHost.response.status).toHaveBeenCalledWith(400);
		expect(objectHost.response.json).toHaveBeenCalledWith({
			message: "Malformed request",
			error: "Bad Request",
		});
	});

	it("uses the client fallback when an exception has no message", () => {
		const { argumentsHost, response } = host();

		new ApiExceptionFilter().catch(
			new HttpException({ error: "Conflict" }, 409),
			argumentsHost,
		);

		expect(response.status).toHaveBeenCalledWith(409);
		expect(response.json).toHaveBeenCalledWith({
			message: "Request failed",
			error: "Conflict",
		});
	});

	it.each([
		new InternalServerErrorException("private provider detail"),
		new Error("private implementation detail"),
	])("sanitizes server failures", (exception) => {
		const { argumentsHost, response } = host();

		new ApiExceptionFilter().catch(exception, argumentsHost);

		expect(response.status).toHaveBeenCalledWith(500);
		expect(response.json).toHaveBeenCalledWith({
			message: "Whoops! Something went wrong on the server",
			error: null,
		});
	});
});
