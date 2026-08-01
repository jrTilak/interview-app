import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
	forbidOnly: Boolean(process.env.CI),
	fullyParallel: true,
	outputDir: "../../.cache/playwright/test-results",
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { height: 900, width: 1440 },
			},
		},
	],
	reporter: "list",
	retries: process.env.CI ? 2 : 0,
	testDir: "./e2e",
	testMatch: "**/*.e2e.ts",
	use: {
		baseURL,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${port} --strictPort`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		url: baseURL,
	},
	workers: process.env.CI ? 1 : undefined,
});
