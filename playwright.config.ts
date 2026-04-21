import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e/playwright",
	timeout: 60_000,
	expect: {
		timeout: 10_000,
	},
	use: {
		baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
		headless: true,
	},
});
