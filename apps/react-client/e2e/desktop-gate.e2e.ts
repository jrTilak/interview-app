import { expect, test } from "@playwright/test";

test("blocks narrow desktop routing and protected API work", async ({
	page,
}) => {
	let apiRequests = 0;
	await page.setViewportSize({ height: 800, width: 900 });
	await page.route(/^https?:\/\/[^/]+\/api(?:\/|$)/, async (route) => {
		apiRequests += 1;
		await route.fulfill({ json: null, status: 200 });
	});

	await page.goto("/login");

	await expect(
		page.getByRole("heading", { name: "Give the room more space." }),
	).toBeVisible();
	await expect(
		page.getByText(/Widen this desktop window to at least 1100 pixels/),
	).toBeVisible();
	expect(apiRequests).toBe(0);

	await page.setViewportSize({ height: 800, width: 1280 });
	await expect(
		page.getByRole("heading", { name: "Welcome back." }),
	).toBeVisible();
	await expect.poll(() => apiRequests).toBe(1);
});
