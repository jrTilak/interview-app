import { Module } from "@nestjs/common";
import { AiModule } from "#/modules/ai/ai.module.js";
import { InterviewsController } from "./interviews.controller.js";
import { InterviewsService } from "./interviews.service.js";

@Module({
	imports: [AiModule],
	controllers: [InterviewsController],
	providers: [InterviewsService],
	exports: [InterviewsService],
})
export class InterviewsModule {}
