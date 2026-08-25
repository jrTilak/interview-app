import { expect, test } from "@playwright/test";

const shareCode = "uF7qP8Q3bFvLXrAQdS5kMK0pNPkVsU8_";
const createdAt = "2026-08-01T08:00:00.000Z";
const hiddenCreatorName = "Dr. Hidden Creator";
const hiddenRawQuestion =
	"Secret rubric: require an internal implementation detail.";

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

test("shows an authenticated candidate only the safe lobby brief and device gate", async ({
	page,
}) => {
	const unexpectedApiRequests: string[] = [];
	page.on("request", (request) => {
		const pathname = new URL(request.url()).pathname;
		if (
			pathname.startsWith("/api/") &&
			pathname !== "/api/auth/get-session" &&
			pathname !== "/api/__flags__" &&
			pathname !== `/api/shared-interviews/${shareCode}`
		) {
			unexpectedApiRequests.push(`${request.method()} ${pathname}`);
		}
	});

	// Make the unsupported-media branch deterministic in headless Chromium.
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: undefined,
		});
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
	await page.route(`**/api/shared-interviews/${shareCode}`, async (route) => {
		await route.fulfill({
			json: {
				message: "Retrieved successfully",
				data: {
					title: "Platform engineering interview",
					description: "A focused conversation about resilient systems.",
					durationMinutes: 45,
					allowMultipleAttempts: false,
					questionCount: 4,
				},
			},
			status: 200,
		});
	});

	await page.goto(`/interviews/${shareCode}`);

	await expect(
		page.getByRole("heading", { name: "Platform engineering interview" }),
	).toBeVisible();
	await expect(page.getByText("45 min", { exact: true })).toBeVisible();
	await expect(page.getByText("4 topics", { exact: true })).toBeVisible();
	await expect(page.getByText("One attempt", { exact: true })).toBeVisible();
	await expect(page.getByText(hiddenCreatorName)).toHaveCount(0);
	await expect(page.getByText(hiddenRawQuestion)).toHaveCount(0);
	expect(unexpectedApiRequests).toEqual([]);

	await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(2);
	await expect(
		page.getByRole("button", { name: "Begin or resume interview" }),
	).toBeDisabled();
	await expect(page.getByRole("alert")).toContainText(
		"This browser cannot provide secure desktop media capture",
	);
});
