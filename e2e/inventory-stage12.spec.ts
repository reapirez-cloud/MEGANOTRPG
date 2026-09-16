import { expect, test } from "@playwright/test"

test("Stage 12 mobile inventory opens bags, drags to a hand and exposes Snake", async ({ page }) => {
  await page.goto("/e2e-inventory-stage12.html")

  await expect(page.getByText("STAGE 12 INVENTORY E2E")).toBeVisible()
  await expect(page.getByText("ПЕРЕНОСКА")).toBeVisible()

  await page.getByRole("button", { name: "Рюкзак" }).click()
  await expect(page.getByText("4×4")).toBeVisible()
  await expect(page.locator("[data-inventory-grid]")).toBeVisible()

  await page.getByRole("button", { name: "←" }).click()
  await expect(page.getByText("СВОБОДНЫЕ ПРЕДМЕТЫ")).toBeVisible()

  const potion = page.getByRole("button", { name: "Зелье" })
  const firstHand = page.locator(
    '[data-inventory-drop-kind="hand"][data-inventory-drop-index="0"]',
  )
  const potionBox = await potion.boundingBox()
  const handBox = await firstHand.boundingBox()
  expect(potionBox).not.toBeNull()
  expect(handBox).not.toBeNull()

  await page.mouse.move(
    potionBox!.x + potionBox!.width / 2,
    potionBox!.y + potionBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    handBox!.x + handBox!.width / 2,
    handBox!.y + handBox!.height / 2,
    { steps: 8 },
  )
  await page.mouse.up()

  await expect(firstHand.getByRole("button", { name: "Зелье" })).toBeVisible()
  await expect(page.getByTestId("inventory-state")).toContainText(
    '"name":"Зелье","placement":"hand","index":0',
  )

  const movedPotion = firstHand.getByRole("button", { name: "Зелье" })
  const movedBox = await movedPotion.boundingBox()
  expect(movedBox).not.toBeNull()
  const point = {
    clientX: movedBox!.x + movedBox!.width / 2,
    clientY: movedBox!.y + movedBox!.height / 2,
  }

  await movedPotion.dispatchEvent("pointerdown", {
    pointerId: 77,
    pointerType: "touch",
    button: 0,
    ...point,
  })
  await page.waitForTimeout(600)

  await expect(page.getByRole("menu")).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Осмотреть" })).toBeVisible()

  await movedPotion.dispatchEvent("pointerup", {
    pointerId: 77,
    pointerType: "touch",
    button: 0,
    ...point,
  })
  await page.getByRole("menuitem", { name: "Осмотреть" }).click()
  await expect(page.getByText("Тестовый предмет.")).toBeVisible()
})
