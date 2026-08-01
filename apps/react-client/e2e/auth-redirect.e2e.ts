import { expect, test } from "@playwright/test";

const shareCode = "uF7qP8Q3bFvLXrAQdS5kMK0pNPkVsU8_";

test("preserves the unauthenticated shared-interview deep link", async ({
	page,
}) => {
	let previewRequests = 0;
	await page.route("**/api/auth/get-session", async (route) => {
		await route.fulfill({ json: null, status: 200 });
	});
	await page.route("**/api/shared-interviews/**", async (route) => {
		previewRequests += 1;
		await route.fulfill({
			json: { message: "Retrieved successfully", data: null },
			status: 200,
		});
	});

	await page.goto(`/interviews/${shareCode}`);

	await expect(
		page.getByRole("heading", { name: "Welcome back." }),
	).toBeVisible();
	await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
	expect(new URL(page.url()).searchParams.get("redirect")).toBe(
		`/interviews/${shareCode}`,
	);
	expect(previewRequests).toBe(0);
	await expect(
		page.getByRole("link", { name: "Create an account" }),
	).toHaveAttribute("href", `/signup?redirect=%2Finterviews%2F${shareCode}`);
});
