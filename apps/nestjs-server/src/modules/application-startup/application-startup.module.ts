import { Module } from "@nestjs/common";
import { DatabaseModule } from "#src/db/database.module.js";
import { ApplicationStartupService } from "./application-startup.service.js";

@Module({
	imports: [DatabaseModule],
	providers: [ApplicationStartupService],
})
export class ApplicationStartupModule {}
