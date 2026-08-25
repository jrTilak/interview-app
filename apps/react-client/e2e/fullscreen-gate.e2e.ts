import { expect, test } from "@playwright/test";

const attemptId = "06597a50-e835-4527-b7eb-b8d5405a816d";
const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
const createdAt = "2026-08-01T08:00:00.000Z";
const concealedQuestion = "Explain the private architecture challenge.";
const handoffKeyPrefix = "interview-desk:interview-attempt-handoff:";
const startedKeyPrefix = "interview-desk:started-interview-attempt:";

const session = {
	session: {
		id: "451ebc55-a27f-48b0-accc-800558a66e42",
		expiresAt: "2026-08-08T08:00:00.000Z",
		token: "opaque-candidate-session",
		createdAt,
		updatedAt: createdAt,
		userId: "4b8757d8-b56b-47eb-827f-65b14977fa25",
	},
	user: {
		id: "4b8757d8-b56b-47eb-827f-65b14977fa25",
		name: "Casey Candidate",
		email: "casey@example.com",
		emailVerified: false,
		createdAt,
		updatedAt: createdAt,
	},
};

test("conceals a live interview until browser fullscreen is entered", async ({
	page,
}) => {
	await page.addInitScript(
		({ attemptId, handoffPrefix, startedPrefix }) => {
			const browser = globalThis as unknown as {
				localStorage: { setItem: (key: string, value: string) => void };
				sessionStorage: { setItem: (key: string, value: string) => void };
			};
			browser.localStorage.setItem(`${startedPrefix}${attemptId}`, "1");
			browser.sessionStorage.setItem(`${handoffPrefix}${attemptId}`, "1");
		},
		{
			attemptId,
			handoffPrefix: handoffKeyPrefix,
			startedPrefix: startedKeyPrefix,
		},
	);
	let socketRequests = 0;
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.startsWith("/socket.io")) {
			socketRequests += 1;
		}
	});
	await page.route("**/api/auth/get-session", async (route) => {
		await route.fulfill({ json: session, status: 200 });
	});
	await page.route("**/api/__flags__", async (route) => {
		await route.fulfill({
			json: {
				data: {
					faceDetectionEnabled: true,
					pauseOnMultipleFaces: true,
					pauseOnNoFace: true,
					requireSingleFaceToStart: true,
					requireWholeScreen: true,
					streamCameraToServer: false,
					streamScreenToServer: false,
					terminateOnMultipleFaces: false,
					terminateOnNoFace: false,
				},
				message: "Retrieved successfully",
			},
			status: 200,
		});
	});
	await page.route(`**/api/interviews/public/${interviewId}`, async (route) => {
		await route.fulfill({
			json: {
				message: "Retrieved successfully",
				data: {
					title: "Focused systems interview",
					description: "A private candidate conversation.",
					durationMinutes: 30,
					allowMultipleAttempts: false,
					questionCount: 3,
				},
			},
			status: 200,
		});
	});
	await page.route(`**/api/interview-attempts/${attemptId}`, async (route) => {
		await route.fulfill({
			json: {
				message: "Retrieved successfully",
				data: {
					id: attemptId,
					state: "LISTENING",
					startedAt: createdAt,
					deadlineAt: "2026-08-01T08:30:00.000Z",
					endedAt: null,
					endReason: null,
					media: {
						cameraActive: true,
						microphoneActive: true,
						screenActive: true,
					},
					turns: [
						{
							id: "f9192558-7953-4e6b-9d64-a17ad726010d",
							sequence: 1,
							role: "assistant",
							text: concealedQuestion,
							startedAt: createdAt,
							endedAt: createdAt,
							createdAt,
						},
					],
				},
			},
			status: 200,
		});
	});

	await page.goto(`/interviews/${interviewId}/attempts/${attemptId}`);

	await expect(
		page.getByRole("heading", { name: "Enter the focused interview view." }),
	).toBeVisible();
	await expect(page.getByText("FULLSCREEN REQUIRED")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Enter fullscreen" }),
	).toBeVisible();
	await expect(page.getByText(concealedQuestion)).toHaveCount(0);
	await expect(page.getByText("Conversation", { exact: true })).toHaveCount(0);
	await page.waitForTimeout(200);
	expect(socketRequests).toBe(0);
});

test("blocks a previously opened attempt from being resumed directly", async ({
	page,
}) => {
	const unexpectedRequests: string[] = [];
	await page.addInitScript(
		({ attemptId, startedPrefix }) => {
			const browser = globalThis as unknown as {
				localStorage: { setItem: (key: string, value: string) => void };
			};
			browser.localStorage.setItem(`${startedPrefix}${attemptId}`, "1");
		},
		{ attemptId, startedPrefix: startedKeyPrefix },
	);
	page.on("request", (request) => {
		const pathname = new URL(request.url()).pathname;
		if (
			pathname.startsWith("/socket.io") ||
			pathname === `/api/interview-attempts/${attemptId}`
		) {
			unexpectedRequests.push(pathname);
		}
	});
	await page.route("**/api/auth/get-session", async (route) => {
		await route.fulfill({ json: session, status: 200 });
	});

	await page.goto(`/interviews/${interviewId}/attempts/${attemptId}`);

	await expect(
		page.getByRole("heading", { name: "Interview cannot be resumed" }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Return to dashboard" }),
	).toBeVisible();
	expect(unexpectedRequests).toEqual([]);
});
