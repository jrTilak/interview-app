import { jest } from "@jest/globals";
import { type INestApplication, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

class AppModule {}
class OpenApiService {}

const createApplication =
	jest.fn<(module: unknown, options: unknown) => Promise<INestApplication>>();

jest.unstable_mockModule("@nestjs/core", () => ({
	NestFactory: { create: createApplication },
}));
jest.unstable_mockModule("#/app.module.js", () => ({ AppModule }));
jest.unstable_mockModule("#/modules/open-api/open-api.service.js", () => ({
	OpenApiService,
}));

const { bootstrapApplication } = await import("./bootstrap.js");

function createApplicationDouble() {
	const configValues: Record<string, unknown> = {
		API_CORS_ORIGINS: " https://owner.example, ,https://candidate.example  ",
		API_PREFIX: "v1/api",
		PORT: 4_321,
	};
	const config = {
		get: jest.fn((key: string) => configValues[key]),
	};
	const openApi = {
		setup: jest.fn<(_app: INestApplication) => Promise<void>>(),
	};
	const setGlobalPrefix = jest.fn();
	const enableCors = jest.fn();
	const enableShutdownHooks = jest.fn();
	const listen = jest.fn<(port: number) => Promise<unknown>>();
	const close = jest.fn<() => Promise<void>>();
	const get = jest.fn((token: unknown) => {
		if (token === ConfigService) return config;
		if (token === OpenApiService) return openApi;
		throw new Error("Unexpected application dependency");
	});
	const app = {
		close,
		enableCors,
		enableShutdownHooks,
		get,
		listen,
		setGlobalPrefix,
	} as unknown as INestApplication;

	openApi.setup.mockResolvedValue(undefined);
	listen.mockResolvedValue(undefined);
	close.mockResolvedValue(undefined);

	return {
		app,
		close,
		config,
		enableCors,
		enableShutdownHooks,
		get,
		listen,
		openApi,
		setGlobalPrefix,
	};
}

describe("bootstrapApplication", () => {
	beforeEach(() => createApplication.mockReset());

	afterEach(() => jest.restoreAllMocks());

	it("configures and starts the Nest application", async () => {
		const logger = jest
			.spyOn(Logger.prototype, "log")
			.mockImplementation(() => undefined);
		const application = createApplicationDouble();
		createApplication.mockResolvedValue(application.app);

		await expect(bootstrapApplication()).resolves.toBe(application.app);

		expect(createApplication).toHaveBeenCalledWith(AppModule, {
			bodyParser: false,
		});
		expect(application.get).toHaveBeenCalledWith(ConfigService);
		expect(application.setGlobalPrefix).toHaveBeenCalledWith("v1/api");
		expect(application.enableCors).toHaveBeenCalledWith({
			credentials: true,
			origin: ["https://owner.example", "https://candidate.example"],
		});
		expect(application.enableShutdownHooks).toHaveBeenCalledTimes(1);
		expect(application.get).toHaveBeenCalledWith(OpenApiService);
		expect(application.openApi.setup).toHaveBeenCalledWith(application.app);
		expect(application.listen).toHaveBeenCalledWith(4_321);
		expect(application.openApi.setup.mock.invocationCallOrder[0]).toBeLessThan(
			application.listen.mock.invocationCallOrder[0] as number,
		);
		expect(application.close).not.toHaveBeenCalled();
		expect(logger).toHaveBeenCalledWith(
			"Server listening at http://localhost:4321",
		);
	});

	it("closes the application and propagates an OpenAPI setup failure", async () => {
		jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
		const failure = new Error("documentation setup failed");
		const application = createApplicationDouble();
		application.openApi.setup.mockRejectedValue(failure);
		createApplication.mockResolvedValue(application.app);

		await expect(bootstrapApplication()).rejects.toBe(failure);

		expect(application.listen).not.toHaveBeenCalled();
		expect(application.close).toHaveBeenCalledTimes(1);
	});

	it("preserves the bootstrap error when cleanup also fails", async () => {
		jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
		const errorLogger = jest
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => undefined);
		const bootstrapFailure = new Error("port unavailable");
		const cleanupFailure = new Error("cleanup failed");
		const application = createApplicationDouble();
		application.listen.mockRejectedValue(bootstrapFailure);
		application.close.mockRejectedValue(cleanupFailure);
		createApplication.mockResolvedValue(application.app);

		await expect(bootstrapApplication()).rejects.toBe(bootstrapFailure);

		expect(application.close).toHaveBeenCalledTimes(1);
		expect(errorLogger).toHaveBeenCalledWith(
			"Application cleanup failed after bootstrap error",
			cleanupFailure,
		);
	});

	it("propagates application creation failure before cleanup is available", async () => {
		const failure = new Error("Nest application creation failed");
		createApplication.mockRejectedValue(failure);

		await expect(bootstrapApplication()).rejects.toBe(failure);
		expect(createApplication).toHaveBeenCalledTimes(1);
	});
});
