import { type INestApplication, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "#/app.module.js";
import { OpenApiService } from "#/modules/open-api/open-api.service.js";
import type { AppConfigService } from "#/types/index.js";

const logger = new Logger("Bootstrap", { timestamp: true });

/** Creates, configures, and starts the NestJS API server. */
export async function bootstrapApplication(): Promise<INestApplication> {
	const app = await NestFactory.create(AppModule, { bodyParser: false });
	try {
		const config = app.get<AppConfigService>(ConfigService);
		app.setGlobalPrefix(config.get("API_PREFIX", { infer: true }));
		app.enableCors({
			credentials: true,
			origin: config
				.get("API_CORS_ORIGINS", { infer: true })
				.split(",")
				.map((origin) => origin.trim())
				.filter(Boolean),
		});
		app.enableShutdownHooks();
		await app.get(OpenApiService).setup(app);

		const port = config.get("PORT", { infer: true });
		await app.listen(port);
		logger.log(`Server listening at http://localhost:${port}`);
		return app;
	} catch (error) {
		await app
			.close()
			.catch((closeError) =>
				logger.error(
					"Application cleanup failed after bootstrap error",
					closeError,
				),
			);
		throw error;
	}
}
