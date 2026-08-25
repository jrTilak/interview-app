import { jest } from "@jest/globals";
import type { INestApplication } from "@nestjs/common";
import { type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import type { AuthService } from "@thallesp/nestjs-better-auth";
import {
	ALLOWED_AUTH_PATHS,
	type ApplicationAuth,
} from "#/modules/auth/auth.factory.js";
import type { AppConfigService } from "#/types/index.js";
import { OpenApiService } from "./open-api.service.js";

const applicationDocument: OpenAPIObject = {
	openapi: "3.0.0",
	info: { title: "Application", version: "0.1.0" },
	paths: { "/api/interviews": {} },
	components: {},
};

function config(overrides: Record<string, unknown> = {}): AppConfigService {
	const values: Record<string, unknown> = {
		SWAGGER_ENABLE: true,
		API_DOCS_FILE_PATH: "docs/api-info.md",
		APP_NAME: "Interview Desk Test",
		...overrides,
	};
	return { get: (key: string) => values[key] } as unknown as AppConfigService;
}

function auth(document: unknown) {
	return {
		service: {
			instance: {
				api: {
					generateOpenAPISchema: jest
						.fn<() => Promise<unknown>>()
						.mockResolvedValue(document),
				},
			},
		} as unknown as AuthService<ApplicationAuth>,
	};
}

function appDouble() {
	const routes = new Map<
		string,
		(request: unknown, response: unknown) => unknown
	>();
	const reply = jest.fn();
	const adapter = {
		get: jest.fn(
			(
				path: string,
				handler: (request: unknown, response: unknown) => unknown,
			) => {
				routes.set(path, handler);
			},
		),
		reply,
	};
	const use = jest.fn();
	return {
		app: {
			getHttpAdapter: () => adapter,
			use,
		} as unknown as INestApplication,
		adapter,
		routes,
		use,
	};
}

function authDocument(): OpenAPIObject {
	return {
		openapi: "3.0.0",
		info: { title: "Auth", version: "1" },
		paths: {
			"/sign-up/email": {},
			"/sign-in/email": {},
			"/sign-out": {},
			"/get-session": {},
			"/request-password-reset": {},
			"/admin/sign-in/email": {},
		},
	};
}

describe("OpenApiService", () => {
	afterEach(() => jest.restoreAllMocks());

	it("does nothing when Swagger is disabled", async () => {
		const authState = auth(authDocument());
		const target = appDouble();
		const createDocument = jest.spyOn(SwaggerModule, "createDocument");
		const service = new OpenApiService(
			config({ SWAGGER_ENABLE: false }),
			authState.service,
		);

		await service.setup(target.app);

		expect(createDocument).not.toHaveBeenCalled();
		expect(
			authState.service.instance.api.generateOpenAPISchema,
		).not.toHaveBeenCalled();
		expect(target.adapter.get).not.toHaveBeenCalled();
		expect(target.use).not.toHaveBeenCalled();
	});

	it("mounts application and narrowly filtered auth documents", async () => {
		const generatedAuthDocument = authDocument();
		const authState = auth(generatedAuthDocument);
		const target = appDouble();
		const createDocument = jest
			.spyOn(SwaggerModule, "createDocument")
			.mockReturnValue(applicationDocument);
		const service = new OpenApiService(config(), authState.service);

		await service.setup(target.app);

		expect(createDocument).toHaveBeenCalledTimes(1);
		const swaggerConfig = createDocument.mock.calls[0]?.[1];
		expect(swaggerConfig?.info).toMatchObject({
			title: "Interview Desk Test API",
			version: "0.1.0",
		});
		expect(swaggerConfig?.info.description).toEqual(expect.any(String));
		expect(swaggerConfig?.components?.securitySchemes).toHaveProperty(
			"betterAuthSession",
		);
		expect(new Set(Object.keys(generatedAuthDocument.paths))).toEqual(
			new Set(ALLOWED_AUTH_PATHS),
		);
		expect(target.adapter.get).toHaveBeenCalledTimes(2);
		expect(target.use).toHaveBeenCalledTimes(2);
		expect(new Set(target.use.mock.calls.map(([path]) => path))).toEqual(
			new Set(["/api-docs", "/auth-docs"]),
		);
		for (const [, middleware] of target.use.mock.calls) {
			expect(middleware).toEqual(expect.any(Function));
		}
		expect(target.routes.has("/api-docs.json")).toBe(true);
		expect(target.routes.has("/auth-docs.json")).toBe(true);

		const response = {};
		target.routes.get("/api-docs.json")?.({}, response);
		expect(target.adapter.reply).toHaveBeenCalledWith(
			response,
			expect.objectContaining({
				info: applicationDocument.info,
				paths: applicationDocument.paths,
			}),
		);
		target.routes.get("/auth-docs.json")?.({}, response);
		expect(target.adapter.reply).toHaveBeenCalledWith(
			response,
			generatedAuthDocument,
		);
	});

	it("rejects a Better Auth document without paths before mounting routes", async () => {
		const authState = auth({ openapi: "3.0.0", info: {} });
		const target = appDouble();
		jest
			.spyOn(SwaggerModule, "createDocument")
			.mockReturnValue(applicationDocument);
		const service = new OpenApiService(config(), authState.service);

		await expect(service.setup(target.app)).rejects.toThrow(
			"Better Auth OpenAPI paths are missing",
		);
		expect(target.adapter.get).not.toHaveBeenCalled();
		expect(target.use).not.toHaveBeenCalled();
	});

	it("propagates docs-file and auth-schema failures without partial routes", async () => {
		const target = appDouble();
		const authState = auth(authDocument());
		const missingFileService = new OpenApiService(
			config({ API_DOCS_FILE_PATH: "docs/missing-file.md" }),
			authState.service,
		);

		await expect(missingFileService.setup(target.app)).rejects.toThrow();
		expect(
			authState.service.instance.api.generateOpenAPISchema,
		).not.toHaveBeenCalled();
		expect(target.adapter.get).not.toHaveBeenCalled();

		jest
			.spyOn(SwaggerModule, "createDocument")
			.mockReturnValue(applicationDocument);
		const schemaFailure = new Error("auth schema unavailable");
		const failingAuth = auth(authDocument());
		jest
			.mocked(failingAuth.service.instance.api.generateOpenAPISchema)
			.mockRejectedValue(schemaFailure);
		const authFailureService = new OpenApiService(
			config(),
			failingAuth.service,
		);

		await expect(authFailureService.setup(target.app)).rejects.toBe(
			schemaFailure,
		);
		expect(target.adapter.get).not.toHaveBeenCalled();
	});
});
