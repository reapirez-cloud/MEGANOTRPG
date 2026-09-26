import { expect, test } from "@playwright/test"

test("compact inventory opens Snake detail and assigns one of five quick slots", async ({ page }) => {
  await page.goto("/e2e-inventory-stage12.html?simple")
  await expect(page.locator("[data-quick-slot]")).toHaveCount(5)
  await expect(page.getByText("Рюкзак")).toBeVisible()
  await expect(page.getByText("Меч", { exact: true })).toBeVisible()
  await page.locator("[data-item-id]").filter({ hasText: "Меч" }).getByRole("button").first().click()
  await expect(page.getByRole("dialog", { name: "Меч" })).toContainText("Тестовый предмет.")
  await page.getByRole("dialog", { name: "Меч" }).getByRole("button", { name: "Закрыть" }).click()
  await page.locator("[data-item-id]").filter({ hasText: "Меч" }).getByRole("button", { name: "Действия: Меч" }).click()
  await page.getByRole("menuitem", { name: "Быстрый доступ" }).click()
  await page.getByRole("menuitem", { name: "Слот 5" }).click()
  await expect(page.locator('[data-quick-slot="5"]')).toContainText("5")
  await expect(page.locator('[data-quick-slot="5"] button[title="Меч"]')).toBeVisible()
  await page.getByRole("button", { name: "Рюкзак" }).click()
  await expect(page.getByText("Здесь нет предметов")).toBeVisible()
})
