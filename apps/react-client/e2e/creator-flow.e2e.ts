import { expect, test } from "@playwright/test";

const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";
const shareCode = "uF7qP8Q3bFvLXrAQdS5kMK0pNPkVsU8_";
const takenInterviewId = "9fc82b70-1829-45af-8a7d-aebea728c43e";
const takenShareCode = "rP7qP8Q3bFvLXrAQdS5kMK0pNPkVsU9_";
const createdAt = "2026-08-01T08:00:00.000Z";

const session = {
	session: {
		id: "451ebc55-a27f-48b0-accc-800558a66e42",
		expiresAt: "2026-08-08T08:00:00.000Z",
		token: "opaque-test-session",
		createdAt,
		updatedAt: createdAt,
		userId: "4b8757d8-b56b-47eb-827f-65b14977fa25",
	},
	user: {
		id: "4b8757d8-b56b-47eb-827f-65b14977fa25",
		name: "Ada Creator",
		email: "ada@example.com",
		emailVerified: false,
		createdAt,
		updatedAt: createdAt,
	},
};

const summary = {
	id: interviewId,
	title: "Existing frontend interview",
	description: "A saved interview",
	durationMinutes: 30,
	allowMultipleAttempts: true,
	questionCount: 2,
	shareCode,
	shareUrl: `http://127.0.0.1:4173/interviews/${shareCode}`,
	createdAt,
};

test("separates candidate history from recruiter management and creates an interview", async ({
	page,
}) => {
	let createBody: Record<string, unknown> | undefined;
	const createdInterview = {
		...summary,
		title: "Realtime React interview",
		description: "Final-year project hiring round",
		durationMinutes: 45,
		questionCount: 1,
		rawQuestions: "Ask about React rendering and realtime state.",
		questions: [
			{
				id: questionId,
				position: 1,
				title: "Realtime state",
				prompt: "Explain how you would coordinate realtime React state.",
				objective: "Understand state ownership",
				followUpGuidance: null,
			},
		],
	};
	const participantAttempt = {
		id: "a244b3ac-40d9-4430-a67a-39a37c9f183d",
		candidate: {
			id: "2aeb3ca8-fd48-42f1-8bd5-c8d06af193eb",
			name: "Casey Participant",
			email: "casey@example.com",
		},
		state: "COMPLETED",
		endReason: "AI_COMPLETED",
		createdAt,
		startedAt: "2026-08-01T08:01:00.000Z",
		deadlineAt: "2026-08-01T08:31:00.000Z",
		endedAt: "2026-08-01T08:24:00.000Z",
		completedQuestionCount: 2,
		totalQuestionCount: 2,
	};
	const candidateHistory = [
		{
			interview: {
				id: takenInterviewId,
				title: "Platform systems interview",
				description: "A candidate interview already taken",
				shareCode: takenShareCode,
				durationMinutes: 30,
				allowMultipleAttempts: true,
			},
			attempts: [
				{
					...participantAttempt,
					id: "5bd20548-b2f3-42fa-a546-9004482bde73",
					candidate: undefined,
				},
				{
					...participantAttempt,
					id: "8c925a14-f358-45b3-91eb-4d6f59b76081",
					candidate: undefined,
					createdAt: "2026-07-31T08:00:00.000Z",
				},
			],
		},
	];

	await page.route("**/api/auth/get-session", async (route) => {
		await route.fulfill({ json: session, status: 200 });
	});
	await page.route("**/api/interview-attempts", async (route) => {
		await route.fulfill({
			json: { message: "Retrieved successfully", data: candidateHistory },
			status: 200,
		});
	});
	await page.route("**/api/interviews**", async (route) => {
		const request = route.request();
		const pathname = new URL(request.url()).pathname;
		if (request.method() === "POST" && pathname === "/api/interviews") {
			createBody = request.postDataJSON() as Record<string, unknown>;
			await route.fulfill({
				json: { message: "Created successfully", data: createdInterview },
				status: 201,
			});
			return;
		}
		if (pathname === `/api/interviews/${interviewId}/attempts`) {
			await route.fulfill({
				json: {
					message: "Retrieved successfully",
					data: [participantAttempt],
				},
				status: 200,
			});
			return;
		}
		if (pathname === `/api/interviews/${interviewId}`) {
			await route.fulfill({
				json: { message: "Retrieved successfully", data: createdInterview },
				status: 200,
			});
			return;
		}
		await route.fulfill({
			json: { message: "Retrieved successfully", data: [summary] },
			status: 200,
		});
	});

	await page.goto("/dashboard");

	await expect(
		page.getByRole("heading", { name: "My interviews" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Interview" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByText("Ada Creator")).toBeVisible();
	await expect(
		page.getByRole("heading", {
			exact: true,
			name: "Platform systems interview",
		}),
	).toBeVisible();
	await expect(page.getByText("Attempt 2")).toBeVisible();
	await expect(page.getByText("Attempt 1")).toBeVisible();

	await page.getByRole("button", { name: "Recruiter" }).click();
	await expect(page).toHaveURL("/recruiter/interviews");
	await expect(page.getByRole("button", { name: "Recruiter" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(
		page.getByRole("heading", { exact: true, name: "Interviews" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: summary.title }),
	).toBeVisible();

	await page.getByRole("link", { name: "Participants" }).click();
	await expect(
		page.getByRole("heading", { exact: true, name: "Participants" }),
	).toBeVisible();
	await expect(page.getByText("Casey Participant")).toBeVisible();
	await expect(page.getByText("casey@example.com")).toBeVisible();
	await expect(page.getByText("2 / 2")).toBeVisible();

	await page.getByRole("link", { exact: true, name: "Create" }).click();

	await expect(
		page.getByRole("heading", { name: "New interview" }),
	).toBeVisible();
	await page
		.getByRole("textbox", { name: /Interview title/ })
		.fill("Realtime React interview");
	await page
		.getByRole("textbox", { name: "Description" })
		.fill("Final-year project hiring round");
	await page.getByRole("combobox", { name: /Duration/ }).selectOption("45");
	const repeatAttempts = page.getByRole("checkbox", {
		name: "Allow repeat attempts",
	});
	await page
		.locator("label")
		.filter({ hasText: "Allow repeat attempts" })
		.click();
	await expect(repeatAttempts).toBeChecked();
	await page
		.getByRole("textbox", { name: /Question notes/ })
		.fill("Ask about React rendering and realtime state.");
	await page.getByRole("button", { name: "Create interview" }).click();

	await expect(page).toHaveURL(`/interviews/owned/${interviewId}`);
	await expect(page.getByRole("button", { name: "Recruiter" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(
		page.getByRole("heading", { name: "Realtime React interview" }),
	).toBeVisible();
	await expect(page.getByText("Structured question set")).toBeVisible();
	await expect(
		page.getByText("Explain how you would coordinate realtime React state."),
	).toBeVisible();
	expect(createBody).toMatchObject({
		allowMultipleAttempts: true,
		description: "Final-year project hiring round",
		durationMinutes: 45,
		rawQuestions: "Ask about React rendering and realtime state.",
		title: "Realtime React interview",
	});
	expect(createBody?.clientRequestId).toEqual(expect.any(String));
	expect(createBody?.clientRequestId).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
	);
});
