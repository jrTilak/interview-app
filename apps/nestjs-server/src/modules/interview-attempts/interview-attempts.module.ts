import { Module } from "@nestjs/common";
import { AiModule } from "#/modules/ai/ai.module.js";
import { InterviewAttemptStateService } from "./interview-attempt-state.service.js";
import { InterviewAttemptsController } from "./interview-attempts.controller.js";
import { InterviewAttemptsService } from "./interview-attempts.service.js";
import { InterviewConversationService } from "./interview-conversation.service.js";
import { InterviewOrchestratorService } from "./interview-orchestrator.service.js";
import { AudioTurnBufferService } from "./realtime/audio-turn-buffer.service.js";
import { InterviewGateway } from "./realtime/interview.gateway.js";

@Module({
	imports: [AiModule],
	controllers: [InterviewAttemptsController],
	providers: [
		InterviewAttemptsService,
		InterviewAttemptStateService,
		InterviewConversationService,
		InterviewOrchestratorService,
		AudioTurnBufferService,
		InterviewGateway,
	],
	exports: [InterviewAttemptsService],
})
export class InterviewAttemptsModule {}
