import { Module } from "@nestjs/common";
import { INTERVIEW_LLM, SPEECH_TO_TEXT, TEXT_TO_SPEECH } from "./ai.ports.js";
import { LocalLlmAdapter } from "./local/local-llm.adapter.js";
import { LocalSpeechToTextAdapter } from "./local/local-stt.adapter.js";
import { LocalTextToSpeechAdapter } from "./local/local-tts.adapter.js";

@Module({
	providers: [
		LocalLlmAdapter,
		LocalSpeechToTextAdapter,
		LocalTextToSpeechAdapter,
		{ provide: INTERVIEW_LLM, useExisting: LocalLlmAdapter },
		{ provide: SPEECH_TO_TEXT, useExisting: LocalSpeechToTextAdapter },
		{ provide: TEXT_TO_SPEECH, useExisting: LocalTextToSpeechAdapter },
	],
	exports: [INTERVIEW_LLM, SPEECH_TO_TEXT, TEXT_TO_SPEECH],
})
export class AiModule {}
