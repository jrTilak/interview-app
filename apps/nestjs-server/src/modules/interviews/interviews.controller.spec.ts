import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import type { User } from "better-auth/types";
import { ApiResponse } from "#src/common/dto/api-response.dto.js";
import type {
	CreateInterviewDto,
	UpdateInterviewDto,
} from "./dto/request.dto.js";
import type {
	InterviewDetailsResponseDto,
	InterviewSummaryResponseDto,
	SharedInterviewPreviewResponseDto,
} from "./dto/response.dto.js";
import { InterviewsController } from "./interviews.controller.js";
import type { InterviewsService } from "./interviews.service.js";

const owner: User = {
	id: "4b8757d8-b56b-47eb-827f-65b14977fa25",
	name: "Interview Owner",
	email: "owner@example.com",
	emailVerified: false,
	image: null,
	createdAt: new Date("2026-08-01T00:00:00.000Z"),
	updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

const session = { user: owner } as unknown as UserSession;
const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";

const details: InterviewDetailsResponseDto = {
	id: interviewId,
	title: "Junior React Developer",
	description: null,
	rawQuestions: "Ask about React state.",
	durationMinutes: 30,
	allowMultipleAttempts: false,
	questionCount: 1,
	isPublic: false,
	createdAt: "2026-08-02T03:04:05.000Z",
	questions: [
		{
			id: questionId,
			position: 1,
			title: "React state",
			prompt: "Explain how React state updates work.",
			objective: null,
			followUpGuidance: null,
		},
	],
};

const summary: InterviewSummaryResponseDto = {
	id: details.id,
	title: details.title,
	description: details.description,
	durationMinutes: details.durationMinutes,
	allowMultipleAttempts: details.allowMultipleAttempts,
	questionCount: details.questionCount,
	isPublic: details.isPublic,
	createdAt: details.createdAt,
};

const preview: SharedInterviewPreviewResponseDto = {
	title: details.title,
	description: details.description,
	durationMinutes: details.durationMinutes,
	allowMultipleAttempts: details.allowMultipleAttempts,
	questionCount: details.questionCount,
};

/** Builds a typed controller dependency with every public method inspectable. */
function serviceMock(): jest.Mocked<InterviewsService> {
	return {
		create: jest.fn<InterviewsService["create"]>(),
		findAllOwned: jest.fn<InterviewsService["findAllOwned"]>(),
		findOwnedById: jest.fn<InterviewsService["findOwnedById"]>(),
		update: jest.fn<InterviewsService["update"]>(),
		remove: jest.fn<InterviewsService["remove"]>(),
		findSharedPreview: jest.fn<InterviewsService["findSharedPreview"]>(),
	} as unknown as jest.Mocked<InterviewsService>;
}

describe("InterviewsController", () => {
	it("delegates creation with the authenticated user and wraps the details", async () => {
		const interviews = serviceMock();
		interviews.create.mockResolvedValue(details);
		const controller = new InterviewsController(interviews);
		const data: CreateInterviewDto = {
			title: details.title,
			rawQuestions: details.rawQuestions,
			durationMinutes: details.durationMinutes,
		};

		const response = await controller.create(data, session);

		expect(response).toBeInstanceOf(ApiResponse);
		expect(response).toEqual(new ApiResponse({ data: details }));
		expect(interviews.create).toHaveBeenCalledWith(data, owner);
	});

	it("delegates the creator-owned list and wraps all summaries", async () => {
		const interviews = serviceMock();
		interviews.findAllOwned.mockResolvedValue([summary]);
		const controller = new InterviewsController(interviews);

		const response = await controller.findAll(session);

		expect(response).toBeInstanceOf(ApiResponse);
		expect(response.data).toEqual([summary]);
		expect(interviews.findAllOwned).toHaveBeenCalledWith(owner);
	});

	it("delegates owned-detail lookup with the route ID and user", async () => {
		const interviews = serviceMock();
		interviews.findOwnedById.mockResolvedValue(details);
		const controller = new InterviewsController(interviews);

		const response = await controller.findById({ id: interviewId }, session);

		expect(response).toEqual(new ApiResponse({ data: details }));
		expect(interviews.findOwnedById).toHaveBeenCalledWith(interviewId, owner);
	});

	it("delegates an update without changing the validated payload", async () => {
		const interviews = serviceMock();
		const updated = { ...details, description: null, isPublic: true };
		interviews.update.mockResolvedValue(updated);
		const controller = new InterviewsController(interviews);
		const changes: UpdateInterviewDto = { description: null, isPublic: true };

		const response = await controller.update(
			{ id: interviewId },
			changes,
			session,
		);

		expect(response).toEqual(new ApiResponse({ data: updated }));
		expect(interviews.update).toHaveBeenCalledWith(interviewId, changes, owner);
	});

	it("delegates deletion and wraps the deleted identifier", async () => {
		const interviews = serviceMock();
		interviews.remove.mockResolvedValue({ id: interviewId });
		const controller = new InterviewsController(interviews);

		const response = await controller.remove({ id: interviewId }, session);

		expect(response).toEqual(new ApiResponse({ data: { id: interviewId } }));
		expect(interviews.remove).toHaveBeenCalledWith(interviewId, owner);
	});

	it("delegates anonymous preview without requiring a session", async () => {
		const interviews = serviceMock();
		interviews.findSharedPreview.mockResolvedValue(preview);
		const controller = new InterviewsController(interviews);

		const response = await controller.preview({ id: interviewId });

		expect(response).toEqual(new ApiResponse({ data: preview }));
		expect(interviews.findSharedPreview).toHaveBeenCalledWith(interviewId);
	});

	it("propagates service errors without replacing their HTTP semantics", async () => {
		const interviews = serviceMock();
		const failure = new NotFoundException("Interview is hidden");
		interviews.findOwnedById.mockRejectedValue(failure);
		const controller = new InterviewsController(interviews);

		await expect(
			controller.findById({ id: interviewId }, session),
		).rejects.toBe(failure);
	});
});
