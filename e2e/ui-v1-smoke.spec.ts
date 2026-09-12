import { expect, test } from "@playwright/test"

test("isolated UI v1 opens Home and real content hubs", async ({ page }) => {
  await page.goto("/ui-v1.html#/home")

  await expect(page.getByText("Мунтар", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Последние события" })).toBeVisible()

  await page.getByRole("button", { name: "Все" }).click()
  await expect(page.getByRole("heading", { name: "Что нового" })).toBeVisible()
  await expect(page.getByText("Хроника кампании")).toBeVisible()

  await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("button", { name: "Главная" }).click()
  await page.getByRole("button", { name: /Мир/i }).click()
  await expect(page.getByRole("heading", { name: "Мир" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Локации/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Персонажи/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Лор/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Карта/i })).toBeVisible()

  await page.goto("/ui-v1.html#/home/world/locations")
  await expect(page.getByRole("heading", { name: "Локации" })).toBeVisible()

  await page.goto("/ui-v1.html#/home/knowledge-base")
  await expect(page.getByRole("heading", { name: "База знаний" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Классы/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Бестиарий/i })).toBeVisible()
})
