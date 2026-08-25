import { Module } from "@nestjs/common";
import { LlmModule } from "./llm/llm.module.js";
import { SttModule } from "./stt/stt.module.js";
import { TtsModule } from "./tts/tts.module.js";

@Module({
	imports: [LlmModule, SttModule, TtsModule],
	exports: [LlmModule, SttModule, TtsModule],
})
export class AiModule {}
