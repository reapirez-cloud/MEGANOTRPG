import { expect, test } from "@playwright/test";

test("application entry point is reachable on a mobile viewport", async ({ page }) => {
  await page.route("https://telegram.org/js/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.Telegram = window.Telegram || { WebApp: {} };",
    });
  });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("#root")).toBeAttached();
});
