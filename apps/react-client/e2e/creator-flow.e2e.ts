import { expect, test } from "@playwright/test";

const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
const questionId = "7635f24a-adb3-457c-8e43-2d0a1a8fa0df";
const shareCode = "uF7qP8Q3bFvLXrAQdS5kMK0pNPkVsU8_";
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
	questionCount: 2,
	shareCode,
	shareUrl: `http://127.0.0.1:4173/interviews/${shareCode}`,
	createdAt,
};

test("loads an authenticated dashboard and creates a structured interview", async ({
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

	await page.route("**/api/auth/get-session", async (route) => {
		await route.fulfill({ json: session, status: 200 });
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
		page.getByRole("heading", { name: "Your interviews" }),
	).toBeVisible();
	await expect(page.getByText("Ada Creator")).toBeVisible();
	await expect(page.getByText(summary.title)).toBeVisible();
	await page
		.getByRole("link", { exact: true, name: "Create interview" })
		.click();

	await expect(
		page.getByRole("heading", { name: "Design the conversation" }),
	).toBeVisible();
	await page
		.getByRole("textbox", { name: /Interview title/ })
		.fill("Realtime React interview");
	await page
		.getByRole("textbox", { name: "Description" })
		.fill("Final-year project hiring round");
	await page.getByRole("combobox", { name: /Duration/ }).selectOption("45");
	await page
		.getByRole("textbox", { name: /Question notes/ })
		.fill("Ask about React rendering and realtime state.");
	await page.getByRole("button", { name: "Structure interview" }).click();

	await expect(page).toHaveURL(`/interviews/owned/${interviewId}`);
	await expect(
		page.getByRole("heading", { name: "Realtime React interview" }),
	).toBeVisible();
	await expect(page.getByText("Structured question set")).toBeVisible();
	await expect(
		page.getByText("Explain how you would coordinate realtime React state."),
	).toBeVisible();
	expect(createBody).toMatchObject({
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
