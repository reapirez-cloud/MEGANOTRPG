import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/e2e-character-spell-panels-stage2.html")
})

test("Stage 2 matches the reference panel hierarchy without horizontal overflow", async ({ page }) => {
  await expect(page.getByText("ЯЧЕЙКИ ЗАКЛИНАНИЙ")).toBeVisible()
  await expect(page.locator(".u1-character-spells__slot")).toHaveCount(9)
  await expect(page.locator('.u1-character-spells__slot[data-exhausted]')).toHaveCount(1)
  await expect(page.locator('.u1-character-spells__circle[data-level="0"]')).toBeVisible()
  await expect(page.locator('.u1-character-spells__circle[data-level="1"]')).toHaveAttribute("data-expanded", "true")
  await expect(page.locator('.u1-character-spells__expanded-grid')).toBeVisible()

  const overflow = await page.locator(".u1-character-sheet").evaluate((sheet) => ({
    clientWidth: sheet.clientWidth,
    scrollWidth: sheet.scrollWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
})

test("Stage 2 accordion keeps exactly one circle expanded", async ({ page }) => {
  await page.locator('.u1-character-spells__circle[data-level="2"] .u1-character-spells__circle-head').click()

  await expect(page.locator('.u1-character-spells__circle[data-expanded]')).toHaveCount(1)
  await expect(page.locator('.u1-character-spells__circle[data-level="2"]')).toHaveAttribute("data-expanded", "true")
  await expect(page.locator('.u1-character-spells__circle[data-level="1"]')).not.toHaveAttribute("data-expanded", "true")

  await page.locator('.u1-character-spells__circle[data-level="2"] .u1-character-spells__grimoire').click()
  await expect(page.locator('.u1-character-spells__grimoire-panel[data-grimoire-level="2"]')).toBeVisible()
  await page.getByRole("button", { name: "Концентрация" }).click()
  await expect(page.getByRole("button", { name: "Концентрация" })).toHaveAttribute("data-active", "true")
  await page.getByRole("button", { name: "Закрыть гримуар" }).click()
  await expect(page.locator('.u1-character-spells__grimoire-panel')).toHaveCount(0)
})
