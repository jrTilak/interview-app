import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AiModule } from "./ai.module.js";
import { INTERVIEW_LLM } from "./llm/llm.port.js";
import { LocalLlmAdapter } from "./llm/local-llm.adapter.js";
import { LocalSpeechToTextAdapter } from "./stt/local-stt.adapter.js";
import { SPEECH_TO_TEXT } from "./stt/stt.port.js";
import { LocalTextToSpeechAdapter } from "./tts/local-tts.adapter.js";
import { TEXT_TO_SPEECH } from "./tts/tts.port.js";

describe("AiModule", () => {
	it("resolves each port to its configured adapter", async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
				AiModule,
			],
		}).compile();

		expect(moduleRef.get(INTERVIEW_LLM)).toBe(moduleRef.get(LocalLlmAdapter));
		expect(moduleRef.get(SPEECH_TO_TEXT)).toBe(
			moduleRef.get(LocalSpeechToTextAdapter),
		);
		expect(moduleRef.get(TEXT_TO_SPEECH)).toBe(
			moduleRef.get(LocalTextToSpeechAdapter),
		);

		await moduleRef.close();
	});
});
