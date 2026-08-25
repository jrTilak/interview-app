import { Module } from "@nestjs/common";
import { AiModule } from "#/modules/ai/ai.module.js";
import { InterviewAttemptsController } from "./interview-attempts.controller.js";
import { InterviewAttemptsService } from "./interview-attempts.service.js";
import { InterviewOrchestratorService } from "./interview-orchestrator.service.js";
import { AudioTurnBufferService } from "./realtime/audio-turn-buffer.service.js";
import { InterviewGateway } from "./realtime/interview.gateway.js";

@Module({
	imports: [AiModule],
	controllers: [InterviewAttemptsController],
	providers: [
		InterviewAttemptsService,
		InterviewOrchestratorService,
		AudioTurnBufferService,
		InterviewGateway,
	],
	exports: [InterviewAttemptsService],
})
export class InterviewAttemptsModule {}
