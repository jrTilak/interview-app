import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { OpenApiService } from "./open-api.service.js";

@Module({
	imports: [ConfigModule],
	providers: [OpenApiService],
	exports: [OpenApiService],
})
export class OpenApiModule {}
