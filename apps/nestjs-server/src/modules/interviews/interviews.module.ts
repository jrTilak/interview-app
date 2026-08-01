import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { InterviewCreationLimiterService } from "./interview-creation-limiter.service.js";
import { InterviewsController } from "./interviews.controller.js";
import { InterviewsService } from "./interviews.service.js";
import { SharedInterviewsController } from "./shared-interviews.controller.js";

@Module({
	imports: [AiModule],
	controllers: [InterviewsController, SharedInterviewsController],
	providers: [InterviewCreationLimiterService, InterviewsService],
	exports: [InterviewsService],
})
export class InterviewsModule {}
