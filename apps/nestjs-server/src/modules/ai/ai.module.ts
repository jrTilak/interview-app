import { Module } from "@nestjs/common";
import { AiHttpService } from "./ai-http.service.js";
import { INTERVIEW_LLM } from "./llm/llm.port.js";
import { LocalLlmAdapter } from "./llm/local-llm.adapter.js";
import { LocalSpeechToTextAdapter } from "./stt/local-stt.adapter.js";
import { SPEECH_TO_TEXT } from "./stt/stt.port.js";
import { LocalTextToSpeechAdapter } from "./tts/local-tts.adapter.js";
import { TEXT_TO_SPEECH } from "./tts/tts.port.js";

@Module({
	providers: [
		AiHttpService,
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
