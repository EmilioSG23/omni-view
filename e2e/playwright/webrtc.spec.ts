import { expect, test } from "@playwright/test";

// This is a minimal smoke scenario for Step 7. The full host-viewer WebRTC
// approval flow will be expanded in later iterations.
test("viewer page shell renders", async ({ page, baseURL }) => {
	if (!baseURL) {
		test.skip(true, "No baseURL configured for e2e run");
	}

	await page.goto("/");
	await expect(page.locator("body")).toBeVisible();
});
