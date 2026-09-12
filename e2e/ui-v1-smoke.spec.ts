import { expect, test } from "@playwright/test"

test("isolated UI v1 opens the new start page and placeholder routes", async ({ page }) => {
  await page.goto("/ui-v1.html#/home")

  await expect(page.getByText("Мунтар", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: /Главная\s+картина/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Что нового/i })).toBeVisible()

  await page.getByRole("button", { name: /Мир/i }).click()
  await expect(page.getByRole("heading", { name: "Мир" })).toBeVisible()
  await expect(page.getByText("UI 1.0 / CONNECTED")).toBeVisible()

  await page.getByRole("button", { name: "Главная" }).click()
  await expect(page.getByText("Мунтар", { exact: true })).toBeVisible()
})
