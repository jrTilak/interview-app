import { expect, test } from "@playwright/test";

const interviewId = "ad83ff52-d2e8-49f1-a580-8086390dc90a";

test("preserves the unauthenticated shared-interview deep link", async ({
	page,
}) => {
	let previewRequests = 0;
	await page.route("**/api/auth/get-session", async (route) => {
		await route.fulfill({ json: null, status: 200 });
	});
	await page.route("**/api/interviews/public/**", async (route) => {
		previewRequests += 1;
		await route.fulfill({
			json: { message: "Retrieved successfully", data: null },
			status: 200,
		});
	});

	await page.goto(`/interviews/${interviewId}`);

	await expect(
		page.getByRole("heading", { name: "Welcome back." }),
	).toBeVisible();
	await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
	expect(new URL(page.url()).searchParams.get("redirect")).toBe(
		`/interviews/${interviewId}`,
	);
	expect(previewRequests).toBe(0);
	await expect(
		page.getByRole("link", { name: "Create an account" }),
	).toHaveAttribute("href", `/signup?redirect=%2Finterviews%2F${interviewId}`);
});
