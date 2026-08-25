import { Module } from "@nestjs/common";
import { LocalTextToSpeechAdapter } from "./local-tts.adapter.js";
import { TEXT_TO_SPEECH } from "./tts.port.js";

@Module({
	providers: [
		LocalTextToSpeechAdapter,
		{ provide: TEXT_TO_SPEECH, useExisting: LocalTextToSpeechAdapter },
	],
	exports: [TEXT_TO_SPEECH],
})
export class TtsModule {}
