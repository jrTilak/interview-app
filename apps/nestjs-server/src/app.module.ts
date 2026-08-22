import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { ShutdownLoggerService } from "./bootstrap/shutdown-logger.service.js";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter.js";
import { ApiResponseInterceptor } from "./common/interceptors/api-response.interceptor.js";
import { AppValidationPipe } from "./common/pipes/app-validation.pipe.js";
import { validateEnvironment } from "./config/environment.schema.js";
import { DatabaseModule } from "./db/database.module.js";
import { ApplicationAuthModule } from "./modules/auth/auth.module.js";
import { DevFlagsModule } from "./modules/dev-flags/dev-flags.module.js";
import { InterviewAttemptsModule } from "./modules/interview-attempts/interview-attempts.module.js";
import { InterviewsModule } from "./modules/interviews/interviews.module.js";
import { OpenApiModule } from "./modules/open-api/open-api.module.js";

@Module({
	imports: [
		ConfigModule.forRoot({
			envFilePath: process.env.ENV_FILE_PATH || ".env",
			isGlobal: true,
			validate: validateEnvironment,
		}),
		DatabaseModule,
		ApplicationAuthModule,
		DevFlagsModule,
		InterviewsModule,
		InterviewAttemptsModule,
		OpenApiModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		ShutdownLoggerService,
		{ provide: APP_PIPE, useClass: AppValidationPipe },
		{ provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
		{ provide: APP_FILTER, useClass: ApiExceptionFilter },
	],
})
export class AppModule {}
