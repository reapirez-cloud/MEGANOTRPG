import { expect, test } from "@playwright/test";

test("new UI v1 is the default application entry on a mobile viewport", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("#ui-v1-root")).toBeAttached();
  await expect(page.getByText("Мунтар", { exact: true })).toBeVisible();
});

test("legacy application entry cannot load the retired app", async ({ page }) => {
  const response = await page.goto("/legacy.html", { waitUntil: "domcontentloaded" });

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("#root")).toHaveCount(0);
  await expect(page.locator("#ui-v1-root")).toBeAttached();
  expect(await page.content()).not.toContain("/src/main.tsx");
});
