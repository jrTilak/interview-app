import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { INTERVIEW_LLM, SPEECH_TO_TEXT, TEXT_TO_SPEECH } from "./ai.ports.js";
import { geminiClientProvider } from "./gemini/gemini-client.provider.js";
import { GeminiLlmAdapter } from "./gemini/gemini-llm.adapter.js";
import { GeminiSpeechToTextAdapter } from "./gemini/gemini-stt.adapter.js";
import { GeminiTextToSpeechAdapter } from "./gemini/gemini-tts.adapter.js";

@Module({
	imports: [ConfigModule],
	providers: [
		geminiClientProvider,
		GeminiLlmAdapter,
		GeminiSpeechToTextAdapter,
		GeminiTextToSpeechAdapter,
		{ provide: INTERVIEW_LLM, useExisting: GeminiLlmAdapter },
		{ provide: SPEECH_TO_TEXT, useExisting: GeminiSpeechToTextAdapter },
		{ provide: TEXT_TO_SPEECH, useExisting: GeminiTextToSpeechAdapter },
	],
	exports: [INTERVIEW_LLM, SPEECH_TO_TEXT, TEXT_TO_SPEECH],
})
export class AiModule {}
