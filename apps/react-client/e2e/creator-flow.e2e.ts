import { expect, test } from "@playwright/test";

const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";
const takenInterviewId = "9fc82b70-1829-45af-8a7d-aebea728c43e";
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
	isPublic: true,
	createdAt,
};

test("separates candidate history from recruiter management and creates an interview", async ({
	page,
}) => {
	let createBody: Record<string, unknown> | undefined;
	let publishBody: Record<string, unknown> | undefined;
	let createdInterview = {
		...summary,
		title: "Realtime React interview",
		description: "Final-year project hiring round",
		durationMinutes: 45,
		questionCount: 1,
		isPublic: false,
		rawQuestions: "React rendering and realtime state.",
		questions: [
			{
				id: questionId,
				position: 1,
				title: "Realtime state",
				prompt: "Rendering, synchronization, and realtime state boundaries",
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
		if (
			request.method() === "PATCH" &&
			pathname === `/api/interviews/${interviewId}`
		) {
			publishBody = request.postDataJSON() as Record<string, unknown>;
			createdInterview = {
				...createdInterview,
				isPublic: publishBody.isPublic === true,
			};
			await route.fulfill({
				json: { message: "Updated successfully", data: createdInterview },
				status: 200,
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
	await expect(page.getByRole("radio", { name: "Interview" })).toBeChecked();
	await expect(page.getByText("Ada Creator")).toBeVisible();
	const sidebar = page.getByRole("complementary", {
		name: "Application sidebar",
	});
	const modeSwitcher = page.getByRole("radiogroup", {
		name: "Workspace mode",
	});
	const [sidebarBounds, modeSwitcherBounds, modeSwitcherOverflow] =
		await Promise.all([
			sidebar.boundingBox(),
			modeSwitcher.boundingBox(),
			modeSwitcher.evaluate(({ clientWidth, scrollWidth }) => ({
				clientWidth,
				scrollWidth,
			})),
		]);
	expect(sidebarBounds).not.toBeNull();
	expect(modeSwitcherBounds).not.toBeNull();
	expect(
		(modeSwitcherBounds?.x ?? 0) + (modeSwitcherBounds?.width ?? 0),
	).toBeLessThanOrEqual((sidebarBounds?.x ?? 0) + (sidebarBounds?.width ?? 0));
	expect(modeSwitcherOverflow.scrollWidth).toBeLessThanOrEqual(
		modeSwitcherOverflow.clientWidth,
	);
	const activeNavigation = page.getByRole("link", { name: "My interviews" });
	await expect(activeNavigation).toHaveAttribute("aria-current", "page");
	await expect(
		page.getByRole("heading", {
			exact: true,
			name: "Platform systems interview",
		}),
	).toBeVisible();
	await expect(page.getByText("Attempt 2")).toBeVisible();
	await expect(page.getByText("Attempt 1")).toBeVisible();

	await page
		.getByRole("radiogroup", { name: "Workspace mode" })
		.getByText("Recruiter", { exact: true })
		.click();
	await expect(page).toHaveURL("/recruiter/interviews");
	await expect(page.getByRole("radio", { name: "Recruiter" })).toBeChecked();
	await expect(
		page.getByRole("heading", { exact: true, name: "Interviews" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: summary.title }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { exact: true, name: "Interviews" }),
	).toHaveAttribute("aria-current", "page");
	await expect(
		sidebar.getByRole("link", { exact: true, name: "Participants" }),
	).toHaveCount(0);
	const createdTime = page.locator(`time[datetime="${createdAt}"]`);
	await expect(createdTime).toBeVisible();
	await expect(createdTime).toHaveText(/Created .*\d{1,2}:\d{2}/);

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
		.getByRole("textbox", { name: /Topics to cover/ })
		.fill("React rendering and realtime state.");
	await page.getByRole("button", { name: "Create interview" }).click();

	await expect(page).toHaveURL(`/interviews/owned/${interviewId}`);
	await expect(page.getByRole("radio", { name: "Recruiter" })).toBeChecked();
	await expect(
		page.getByRole("heading", { name: "Realtime React interview" }),
	).toBeVisible();
	await expect(page.getByText("Conversation topics")).toBeVisible();
	await expect(
		page.getByText("Rendering, synchronization, and realtime state boundaries"),
	).toBeVisible();
	await expect(page.getByText("Original topic notes")).toBeVisible();
	await expect(
		page.getByText("React rendering and realtime state."),
	).toBeVisible();
	await expect(page.getByText("Private", { exact: true })).toBeVisible();
	await expect(
		page.getByRole("button", { exact: true, name: "Publish interview" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { exact: true, name: "Copy to clipboard" }),
	).toHaveCount(0);
	await expect(
		page.getByRole("link", { exact: true, name: "Preview" }),
	).toHaveCount(0);

	await page
		.getByRole("button", { exact: true, name: "Publish interview" })
		.click();
	await expect(page.getByText("Published", { exact: true })).toBeVisible();
	await expect(
		page.getByRole("button", { exact: true, name: "Copy to clipboard" }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { exact: true, name: "Preview" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { exact: true, name: "Unpublish" }),
	).toBeVisible();
	const detailOverflow = await page.getByRole("main").evaluate((element) => ({
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth,
	}));
	expect(detailOverflow.scrollWidth).toBeLessThanOrEqual(
		detailOverflow.clientWidth,
	);
	expect(publishBody).toEqual({ isPublic: true });

	await page
		.getByRole("link", { exact: true, name: "Participant attempts" })
		.click();
	await expect(page).toHaveURL(`/interviews/owned/${interviewId}/participants`);
	await expect(
		page.getByRole("heading", { exact: true, name: "Participant attempts" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { exact: true, name: createdInterview.title }),
	).toBeVisible();
	await expect(page.getByText("Casey Participant")).toBeVisible();
	await expect(page.getByText("casey@example.com")).toBeVisible();
	await expect(page.getByText("2 / 2")).toBeVisible();
	expect(createBody).toMatchObject({
		allowMultipleAttempts: true,
		description: "Final-year project hiring round",
		durationMinutes: 45,
		rawQuestions: "React rendering and realtime state.",
		title: "Realtime React interview",
	});
	expect(createBody).not.toHaveProperty("clientRequestId");
});
