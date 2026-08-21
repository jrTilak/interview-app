import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import type { AppConfigService } from "../../types/index.js";
import {
	INTERVIEW_LLM,
	SPEECH_TO_TEXT,
	type SpeechToTextPort,
	TEXT_TO_SPEECH,
	type TextToSpeechPort,
} from "./ai.ports.js";
import { geminiClientProvider } from "./gemini/gemini-client.provider.js";
import { GeminiLlmAdapter } from "./gemini/gemini-llm.adapter.js";
import { GeminiSpeechToTextAdapter } from "./gemini/gemini-stt.adapter.js";
import { GeminiTextToSpeechAdapter } from "./gemini/gemini-tts.adapter.js";
import { LocalSpeechToTextAdapter } from "./local/local-stt.adapter.js";
import { LocalTextToSpeechAdapter } from "./local/local-tts.adapter.js";

/** Selects exactly one configured STT adapter; providers never fall back. */
export function selectSpeechToTextProvider(
	config: AppConfigService,
	gemini: GeminiSpeechToTextAdapter,
	local: LocalSpeechToTextAdapter,
): SpeechToTextPort {
	const provider = config.get("STT_PROVIDER", { infer: true });
	if (provider === "gemini") return gemini;
	if (provider === "local") return local;
	throw new Error(`Unsupported STT provider: ${String(provider)}`);
}

/** Selects exactly one configured TTS adapter; providers never fall back. */
export function selectTextToSpeechProvider(
	config: AppConfigService,
	gemini: GeminiTextToSpeechAdapter,
	local: LocalTextToSpeechAdapter,
): TextToSpeechPort {
	const provider = config.get("TTS_PROVIDER", { infer: true });
	if (provider === "gemini") return gemini;
	if (provider === "local") return local;
	throw new Error(`Unsupported TTS provider: ${String(provider)}`);
}

@Module({
	imports: [ConfigModule],
	providers: [
		geminiClientProvider,
		GeminiLlmAdapter,
		GeminiSpeechToTextAdapter,
		GeminiTextToSpeechAdapter,
		LocalSpeechToTextAdapter,
		LocalTextToSpeechAdapter,
		{ provide: INTERVIEW_LLM, useExisting: GeminiLlmAdapter },
		{
			provide: SPEECH_TO_TEXT,
			inject: [
				ConfigService,
				GeminiSpeechToTextAdapter,
				LocalSpeechToTextAdapter,
			],
			useFactory: selectSpeechToTextProvider,
		},
		{
			provide: TEXT_TO_SPEECH,
			inject: [
				ConfigService,
				GeminiTextToSpeechAdapter,
				LocalTextToSpeechAdapter,
			],
			useFactory: selectTextToSpeechProvider,
		},
	],
	exports: [INTERVIEW_LLM, SPEECH_TO_TEXT, TEXT_TO_SPEECH],
})
export class AiModule {}
