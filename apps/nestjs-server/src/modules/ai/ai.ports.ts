export const INTERVIEW_LLM = Symbol("INTERVIEW_LLM");
export const SPEECH_TO_TEXT = Symbol("SPEECH_TO_TEXT");
export const TEXT_TO_SPEECH = Symbol("TEXT_TO_SPEECH");

export type StructuredInterviewQuestion = {
	title: string;
	prompt: string;
	objective: string | null;
	followUpGuidance: string | null;
};

export type StructureQuestionsInput = {
	interviewTitle: string;
	interviewDescription: string | null;
	rawQuestions: string;
	signal?: AbortSignal;
};

export type InterviewTaskContext = StructuredInterviewQuestion & {
	id: string;
	position: number;
	completed: boolean;
};

export type InterviewTranscriptEntry = {
	role: "assistant" | "candidate";
	text: string;
};

export type GenerateInterviewTurnInput = {
	interview: {
		title: string;
		description: string | null;
	};
	candidate: {
		name: string;
	};
	tasks: InterviewTaskContext[];
	transcript: InterviewTranscriptEntry[];
	remainingSeconds: number;
	mustEnd: boolean;
	signal?: AbortSignal;
};

export type InterviewModelAction =
	| { type: "complete_questions"; questionIds: string[] }
	| { type: "end_interview"; reason: string };

export type GeneratedInterviewTurn = {
	text: string;
	actions: InterviewModelAction[];
};

export interface InterviewLlmPort {
	structureQuestions(
		input: StructureQuestionsInput,
	): Promise<StructuredInterviewQuestion[]>;
	generateTurn(
		input: GenerateInterviewTurnInput,
	): Promise<GeneratedInterviewTurn>;
}

export type TranscribeAudioInput = {
	bytes: Uint8Array;
	mimeType: string;
	sampleRateHz?: number;
	channels?: number;
	signal?: AbortSignal;
};

export interface SpeechToTextPort {
	transcribe(input: TranscribeAudioInput): Promise<string>;
}

export type SynthesizeSpeechInput = {
	text: string;
	voice?: string;
	signal?: AbortSignal;
};

export type SpeechChunk = {
	bytes: Uint8Array;
	mimeType: string;
	sampleRateHz?: number;
	channels?: number;
};

export interface TextToSpeechPort {
	synthesize(input: SynthesizeSpeechInput): Promise<SpeechChunk>;
}
