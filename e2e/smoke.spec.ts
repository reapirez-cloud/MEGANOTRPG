import { expect, test } from "@playwright/test";

test("new UI v1 is the default application entry on a mobile viewport", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("#ui-v1-root")).toBeAttached();
  await expect(page.getByText("Мунтар", { exact: true })).toBeVisible();
});

test("legacy application remains reachable only through its explicit entry", async ({ page }) => {
  await page.route("https://telegram.org/js/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.Telegram = window.Telegram || { WebApp: {} };",
    });
  });

  const response = await page.goto("/legacy.html", { waitUntil: "domcontentloaded" });

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("#root")).toBeAttached();
});
