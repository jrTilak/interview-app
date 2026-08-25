export const INTERVIEW_LLM = Symbol("INTERVIEW_LLM");

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
	turnCount: number;
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
		variationKey: string;
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
