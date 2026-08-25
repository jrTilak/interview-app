import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../db/database.module.js";
import { ApplicationStartupService } from "./application-startup.service.js";

@Module({
	imports: [DatabaseModule],
	providers: [ApplicationStartupService],
})
export class ApplicationStartupModule {}
