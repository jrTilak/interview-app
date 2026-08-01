import { GoogleGenAI } from "@google/genai";
import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfigService } from "../../../types/index.js";
import { GEMINI_CLIENT } from "./gemini.constants.js";

/** Creates the server-only Google Gen AI client. */
function createGeminiClient(config: AppConfigService): GoogleGenAI {
	return new GoogleGenAI({
		apiKey: config.get("GEMINI_API_KEY", { infer: true }),
	});
}

export const geminiClientProvider: FactoryProvider<GoogleGenAI> = {
	provide: GEMINI_CLIENT,
	inject: [ConfigService],
	useFactory: createGeminiClient,
};
