import { Module } from "@nestjs/common";
import { LocalSpeechToTextAdapter } from "./local-stt.adapter.js";
import { SPEECH_TO_TEXT } from "./stt.port.js";

@Module({
	providers: [
		LocalSpeechToTextAdapter,
		{ provide: SPEECH_TO_TEXT, useExisting: LocalSpeechToTextAdapter },
	],
	exports: [SPEECH_TO_TEXT],
})
export class SttModule {}
