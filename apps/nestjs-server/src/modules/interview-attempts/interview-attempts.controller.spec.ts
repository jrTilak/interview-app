import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import type { User } from "better-auth/types";
import { ApiResponse } from "#src/common/dto/api-response.dto.js";
import type {
	AttemptSnapshot,
	CandidateInterviewHistory,
	CreatorAttemptHistory,
} from "./dto/response.dto.js";
import { InterviewAttemptsController } from "./interview-attempts.controller.js";
import type { InterviewAttemptsService } from "./interview-attempts.service.js";

const candidate: User = {
	id: "4b8757d8-b56b-47eb-827f-65b14977fa25",
	name: "Ada Candidate",
	email: "ada@example.com",
	emailVerified: false,
	image: null,
	createdAt: new Date("2026-08-01T00:00:00.000Z"),
	updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

const session = { user: candidate } as unknown as UserSession;
const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
const attemptId = "f0c765b0-a9fe-4a67-bf75-a63486949831";

const snapshot: AttemptSnapshot = {
	id: attemptId,
	state: "LISTENING",
	startedAt: "2026-08-01T00:00:00.000Z",
	deadlineAt: "2026-08-01T00:30:00.000Z",
	endedAt: null,
	endReason: null,
	media: {
		cameraActive: true,
		screenActive: false,
		microphoneActive: true,
	},
	turns: [],
};

const creatorHistory: CreatorAttemptHistory = {
	id: attemptId,
	candidate: {
		id: candidate.id,
		name: candidate.name,
		email: candidate.email,
	},
	state: "COMPLETED",
	endReason: "AI_COMPLETED",
	createdAt: "2026-08-01T00:00:00.000Z",
	startedAt: "2026-08-01T00:00:00.000Z",
	deadlineAt: "2026-08-01T00:30:00.000Z",
	endedAt: "2026-08-01T00:10:00.000Z",
	completedQuestionCount: 2,
	totalQuestionCount: 2,
};

const candidateHistory: CandidateInterviewHistory = {
	interview: {
		id: interviewId,
		title: "Backend interview",
		description: null,
		durationMinutes: 30,
		allowMultipleAttempts: false,
	},
	attempts: [
		{
			id: creatorHistory.id,
			state: creatorHistory.state,
			endReason: creatorHistory.endReason,
			createdAt: creatorHistory.createdAt,
			startedAt: creatorHistory.startedAt,
			deadlineAt: creatorHistory.deadlineAt,
			endedAt: creatorHistory.endedAt,
			completedQuestionCount: creatorHistory.completedQuestionCount,
			totalQuestionCount: creatorHistory.totalQuestionCount,
		},
	],
};

function serviceMock(): jest.Mocked<InterviewAttemptsService> {
	return {
		createOrResume: jest.fn<InterviewAttemptsService["createOrResume"]>(),
		findAllForCreator: jest.fn<InterviewAttemptsService["findAllForCreator"]>(),
		findAllForCandidate:
			jest.fn<InterviewAttemptsService["findAllForCandidate"]>(),
		findSnapshot: jest.fn<InterviewAttemptsService["findSnapshot"]>(),
	} as unknown as jest.Mocked<InterviewAttemptsService>;
}

describe("InterviewAttemptsController", () => {
	it("creates or resumes an attempt for the authenticated candidate", async () => {
		const attempts = serviceMock();
		attempts.createOrResume.mockResolvedValue(snapshot);
		const controller = new InterviewAttemptsController(attempts);

		const response = await controller.createOrResume(
			{ id: interviewId },
			session,
		);

		expect(response).toEqual(new ApiResponse({ data: snapshot }));
		expect(attempts.createOrResume).toHaveBeenCalledWith(
			interviewId,
			candidate,
		);
	});

	it("returns creator-owned participant history", async () => {
		const attempts = serviceMock();
		attempts.findAllForCreator.mockResolvedValue([creatorHistory]);
		const controller = new InterviewAttemptsController(attempts);

		const response = await controller.findAttempts(
			{ id: interviewId },
			session,
		);

		expect(response).toEqual(new ApiResponse({ data: [creatorHistory] }));
		expect(attempts.findAllForCreator).toHaveBeenCalledWith(
			interviewId,
			candidate,
		);
	});

	it("returns the authenticated candidate's grouped history", async () => {
		const attempts = serviceMock();
		attempts.findAllForCandidate.mockResolvedValue([candidateHistory]);
		const controller = new InterviewAttemptsController(attempts);

		const response = await controller.findAllHistory(session);

		expect(response).toEqual(new ApiResponse({ data: [candidateHistory] }));
		expect(attempts.findAllForCandidate).toHaveBeenCalledWith(candidate);
	});

	it("returns one candidate-owned reconnect snapshot", async () => {
		const attempts = serviceMock();
		attempts.findSnapshot.mockResolvedValue(snapshot);
		const controller = new InterviewAttemptsController(attempts);

		const response = await controller.findSnapshot({ id: attemptId }, session);

		expect(response).toEqual(new ApiResponse({ data: snapshot }));
		expect(attempts.findSnapshot).toHaveBeenCalledWith(attemptId, candidate);
	});

	it("preserves service error semantics", async () => {
		const attempts = serviceMock();
		const failure = new NotFoundException("Interview attempt does not exist");
		attempts.findSnapshot.mockRejectedValue(failure);
		const controller = new InterviewAttemptsController(attempts);

		await expect(
			controller.findSnapshot({ id: attemptId }, session),
		).rejects.toBe(failure);
	});
});
