import { Module } from "@nestjs/common";
import { INTERVIEW_LLM } from "./llm.port.js";
import { LocalLlmAdapter } from "./local-llm.adapter.js";

@Module({
	providers: [
		LocalLlmAdapter,
		{ provide: INTERVIEW_LLM, useExisting: LocalLlmAdapter },
	],
	exports: [INTERVIEW_LLM],
})
export class LlmModule {}
