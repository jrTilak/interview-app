import { readFile } from "node:fs/promises";
import { type INestApplication, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	DocumentBuilder,
	type OpenAPIObject,
	SwaggerModule,
} from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { cleanupOpenApiDoc } from "nestjs-zod";
import {
	ALLOWED_AUTH_PATHS,
	type ApplicationAuth,
} from "#src/modules/auth/auth.factory.js";
import type { AppConfigService } from "#src/types/index.js";

@Injectable()
export class OpenApiService {
	constructor(
		@Inject(ConfigService)
		private readonly _config: AppConfigService,
		private readonly _authService: AuthService<ApplicationAuth>,
	) {}

	/** Removes Better Auth routes outside the deliberately narrow auth surface. */
	private _narrowAuthDocument(document: unknown): OpenAPIObject {
		const candidate = document as OpenAPIObject;
		if (!candidate.paths)
			throw new Error("Better Auth OpenAPI paths are missing");
		for (const path of Object.keys(candidate.paths)) {
			if (!ALLOWED_AUTH_PATHS.some((allowed) => path === allowed)) {
				delete candidate.paths[path];
			}
		}
		return candidate;
	}

	/** Generates and mounts separate application and Better Auth API documents. */
	async setup(app: INestApplication): Promise<void> {
		if (!this._config.get("SWAGGER_ENABLE", { infer: true })) return;

		const description = await readFile(
			this._config.get("API_DOCS_FILE_PATH", { infer: true }),
			"utf8",
		);
		const document = cleanupOpenApiDoc(
			SwaggerModule.createDocument(
				app,
				new DocumentBuilder()
					.setTitle(`${this._config.get("APP_NAME", { infer: true })} API`)
					.setDescription(description)
					.setVersion("0.1.0")
					.addCookieAuth(
						"better-auth.session_token",
						{
							type: "apiKey",
							in: "cookie",
							description: "Better Auth session cookie.",
						},
						"betterAuthSession",
					)
					.build(),
			),
		);
		const authDocument = this._narrowAuthDocument(
			await this._authService.instance.api.generateOpenAPISchema(),
		);
		const adapter = app.getHttpAdapter();

		for (const entry of [
			{ ui: "/api-docs", json: "/api-docs.json", content: document },
			{ ui: "/auth-docs", json: "/auth-docs.json", content: authDocument },
		]) {
			adapter.get(entry.json, (_request, response) =>
				adapter.reply(response, entry.content),
			);
			app.use(
				entry.ui,
				apiReference({ content: entry.content, theme: "kepler" }),
			);
		}
	}
}
