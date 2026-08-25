import { expect, test } from "@playwright/test";

const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";
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
			pathname !== `/api/interviews/public/${interviewId}`
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
	await page.route(`**/api/interviews/public/${interviewId}`, async (route) => {
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

	await page.goto(`/interviews/${interviewId}`);

	await expect(
		page.getByRole("heading", { name: "Platform engineering interview" }),
	).toBeVisible();
	await expect(page.getByText("45 min", { exact: true })).toBeVisible();
	await expect(page.getByText("4 topics", { exact: true })).toBeVisible();
	await expect(page.getByText("One attempt", { exact: true })).toBeVisible();
	await expect(page.getByText(hiddenCreatorName)).toHaveCount(0);
	await expect(page.getByText(hiddenRawQuestion)).toHaveCount(0);
	await expect(page.getByText("Media handling in this phase")).toHaveCount(0);
	expect(unexpectedApiRequests).toEqual([]);

	await expect(
		page.getByRole("button", { name: "Connect camera and microphone" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Connect screen sharing" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { exact: true, name: "Begin interview" }),
	).toBeDisabled();
	await expect(page.getByRole("alert")).toContainText(
		"This browser cannot provide secure desktop media capture",
	);
});

test("rejects a window share without leaving the candidate lobby", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const track = {
			addEventListener: () => undefined,
			getSettings: () => ({ displaySurface: "window" }),
			readyState: "live",
			stop: () => undefined,
		};
		const stream = {
			getAudioTracks: () => [],
			getTracks: () => [track],
			getVideoTracks: () => [track],
		};
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: {
				getDisplayMedia: async () => stream,
				getUserMedia: async () => stream,
			},
		});
	});
	await page.route("**/api/auth/get-session", async (route) => {
		await route.fulfill({ json: session, status: 200 });
	});
	await page.route("**/api/__flags__", async (route) => {
		await route.fulfill({
			json: {
				data: {
					faceDetectionEnabled: false,
					pauseOnMultipleFaces: true,
					pauseOnNoFace: true,
					requireSingleFaceToStart: false,
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

	await page.goto(`/interviews/${interviewId}`);
	await page.getByRole("button", { name: "Connect screen sharing" }).click();

	await expect(page).toHaveURL(`/interviews/${interviewId}`);
	await expect(page.getByRole("alert")).toContainText("Entire Screen required");
	await expect(page.getByRole("alert")).toContainText(
		"Tabs and app windows are not allowed",
	);
	await expect(
		page.getByRole("button", { exact: true, name: "Begin interview" }),
	).toBeDisabled();
});

test("blocks a create-or-resume response for an attempt that already started", async ({
	page,
}) => {
	const attemptId = "06597a50-e835-4527-b7eb-b8d5405a816d";
	let joinRequests = 0;

	await page.addInitScript(() => {
		const browser = globalThis as unknown as {
			document: { documentElement: object };
			HTMLMediaElement: { prototype: object };
		};
		const createTrack = (settings: { displaySurface?: string } = {}) => ({
			addEventListener: () => undefined,
			getSettings: () => settings,
			readyState: "live",
			stop() {
				this.readyState = "ended";
			},
		});
		const cameraVideo = createTrack();
		const cameraAudio = createTrack();
		const screenVideo = createTrack({ displaySurface: "monitor" });
		const cameraStream = {
			getAudioTracks: () => [cameraAudio],
			getTracks: () => [cameraVideo, cameraAudio],
			getVideoTracks: () => [cameraVideo],
		};
		const screenStream = {
			getAudioTracks: () => [],
			getTracks: () => [screenVideo],
			getVideoTracks: () => [screenVideo],
		};

		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: {
				getDisplayMedia: async () => screenStream,
				getUserMedia: async () => cameraStream,
			},
		});
		Object.defineProperty(browser.HTMLMediaElement.prototype, "srcObject", {
			configurable: true,
			get: () => null,
			set: () => undefined,
		});
		Object.defineProperty(browser.HTMLMediaElement.prototype, "play", {
			configurable: true,
			value: async () => undefined,
		});
		Object.defineProperty(browser.document, "fullscreenEnabled", {
			configurable: true,
			value: true,
		});
		Object.defineProperty(
			browser.document.documentElement,
			"requestFullscreen",
			{
				configurable: true,
				value: async () => undefined,
			},
		);

		class FakeAudioContext {
			readonly destination = {};
			state: "closed" | "running" | "suspended" = "suspended";

			async close() {
				this.state = "closed";
			}

			createBufferSource() {
				return {};
			}

			async decodeAudioData() {
				return {};
			}

			async resume() {
				this.state = "running";
			}

			async suspend() {
				this.state = "suspended";
			}
		}
		Object.defineProperty(globalThis, "AudioContext", {
			configurable: true,
			value: FakeAudioContext,
		});
	});
	await page.route("**/api/auth/get-session", async (route) => {
		await route.fulfill({ json: session, status: 200 });
	});
	await page.route("**/api/__flags__", async (route) => {
		await route.fulfill({
			json: {
				data: {
					faceDetectionEnabled: false,
					pauseOnMultipleFaces: true,
					pauseOnNoFace: true,
					requireSingleFaceToStart: false,
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
	await page.route(
		`**/api/shared-interviews/${interviewId}/attempts`,
		async (route) => {
			joinRequests += 1;
			await route.fulfill({
				json: {
					message: "Retrieved successfully",
					data: {
						id: attemptId,
						state: "READY",
						startedAt: createdAt,
						deadlineAt: "2026-08-01T08:45:00.000Z",
						endedAt: null,
						endReason: null,
						media: {
							cameraActive: false,
							microphoneActive: false,
							screenActive: false,
						},
						turns: [],
					},
				},
				status: 201,
			});
		},
	);

	await page.goto(`/interviews/${interviewId}`);
	await page
		.getByRole("button", { name: "Connect camera and microphone" })
		.click();
	await page.getByRole("button", { name: "Connect screen sharing" }).click();
	const begin = page.getByRole("button", {
		exact: true,
		name: "Begin interview",
	});
	await expect(begin).toBeEnabled();
	await begin.click();

	await expect(page).toHaveURL(`/interviews/${interviewId}`);
	await expect(page.getByRole("alert")).toContainText("Attempt already used");
	await expect(page.getByRole("alert")).toContainText(
		"already opened and cannot be resumed",
	);
	await expect(begin).toBeDisabled();
	expect(joinRequests).toBe(1);
});
