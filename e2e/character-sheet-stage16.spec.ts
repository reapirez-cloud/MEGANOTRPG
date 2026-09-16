import { expect, test, type Page } from "@playwright/test"

async function installTelegramBackButton(page: Page) {
  await page.addInitScript(() => {
    const state = {
      shown: 0,
      hidden: 0,
      callback: null as null | (() => void),
    }

    ;(window as any).__stage16BackState = state
    ;(window as any).__fireStage16TelegramBack = () => {
      state.callback?.()
    }
    ;(window as any).Telegram = {
      WebApp: {
        BackButton: {
          show() {
            state.shown += 1
          },
          hide() {
            state.hidden += 1
          },
          onClick(callback: () => void) {
            state.callback = callback
          },
          offClick(callback: () => void) {
            if (state.callback === callback) state.callback = null
          },
        },
      },
    }
  })
}

test.beforeEach(async ({ page }) => {
  await installTelegramBackButton(page)
})

test("Stage 16 keeps the character sheet inside 320/360/390/430 mobile widths", async ({ page }) => {
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto("/e2e-character-sheet-stage16.html")

    await expect(page.getByText("Сертификационный герой")).toBeVisible()

    const metrics = await page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>(".u1-character-sheet")
      const masthead = document.querySelector<HTMLElement>(
        ".u1-character-sheet__masthead",
      )
      const core = document.querySelector<HTMLElement>(
        '[data-testid="stage16-core"]',
      )
      if (!sheet || !masthead || !core) throw new Error("Stage 16 shell missing")

      const rect = sheet.getBoundingClientRect()
      return {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        left: rect.left,
        right: rect.right,
        mastheadWidth: masthead.getBoundingClientRect().width,
        coreWidth: core.getBoundingClientRect().width,
      }
    })

    expect(metrics.documentWidth).toBeLessThanOrEqual(width)
    expect(metrics.bodyWidth).toBeLessThanOrEqual(width)
    expect(metrics.left).toBeGreaterThanOrEqual(-0.5)
    expect(metrics.right).toBeLessThanOrEqual(width + 0.5)
    expect(metrics.mastheadWidth).toBeGreaterThan(0)
    expect(metrics.coreWidth).toBeGreaterThan(0)
  }
})

test("Stage 16 consumes Telegram safe areas and stable viewport height", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/e2e-character-sheet-stage16.html")

  await page.evaluate(() => {
    const root = document.documentElement
    root.style.setProperty("--tg-safe-area-inset-top", "20px")
    root.style.setProperty("--tg-content-safe-area-inset-top", "28px")
    root.style.setProperty("--tg-safe-area-inset-bottom", "14px")
    root.style.setProperty("--tg-content-safe-area-inset-bottom", "22px")
    root.style.setProperty("--tg-viewport-stable-height", "700px")
  })

  const values = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".u1-character-sheet")
    const topbar = document.querySelector<HTMLElement>(
      ".u1-character-sheet__topbar",
    )
    const app = document.querySelector<HTMLElement>(".u1-app")
    if (!sheet || !topbar || !app) throw new Error("Stage 16 shell missing")

    const sheetStyle = getComputedStyle(sheet)
    const topbarStyle = getComputedStyle(topbar)
    const appStyle = getComputedStyle(app)

    return {
      paddingTop: Number.parseFloat(sheetStyle.paddingTop),
      paddingBottom: Number.parseFloat(sheetStyle.paddingBottom),
      stickyTop: Number.parseFloat(topbarStyle.top),
      appHeight: Number.parseFloat(appStyle.height),
    }
  })

  expect(values.paddingTop).toBe(36)
  expect(values.paddingBottom).toBe(90)
  expect(values.stickyTop).toBe(28)
  expect(values.appHeight).toBe(700)
})

test("Stage 16 Telegram Back restores Inventory focus and sheet history in order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/e2e-character-sheet-stage16.html")

  await page.getByRole("button", { name: "Умения" }).click()
  await page.getByTestId("stage16-focus-item").click()
  await page.getByRole("button", { name: "Инвентарь" }).click()

  await expect(
    page.locator('[data-inventory-status="placeholder"]'),
  ).toBeVisible()
  await expect(page.getByText("Тестовый предмет")).toBeVisible()

  const telegramShown = await page.evaluate(
    () => (window as any).__stage16BackState.shown,
  )
  expect(telegramShown).toBeGreaterThan(0)

  await page.evaluate(() => (window as any).__fireStage16TelegramBack())
  await expect(
    page.locator('[data-inventory-status="placeholder"]'),
  ).toHaveCount(0)
  await expect.poll(
    () => page.evaluate(
      () => (window.history.state as any)?.characterSheet?.section,
    ),
  ).toBe("features")

  await page.evaluate(() => (window as any).__fireStage16TelegramBack())
  await expect.poll(
    () => page.evaluate(
      () => (window.history.state as any)?.characterSheet?.section,
    ),
  ).toBe("overview")

  await page.evaluate(() => (window as any).__fireStage16TelegramBack())
  await expect(page.getByTestId("stage16-left-route")).toBeVisible()
})

test("Stage 16 cancels Snake long press when the user starts scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/e2e-character-sheet-stage16.html")

  const target = page.getByTestId("stage16-snake-target")
  await target.scrollIntoViewIfNeeded()

  const box = await target.boundingBox()
  expect(box).not.toBeNull()

  const point = {
    pointerId: 31,
    pointerType: "touch",
    button: 0,
    clientX: box!.x + box!.width / 2,
    clientY: box!.y + box!.height / 2,
  }

  await target.dispatchEvent("pointerdown", point)
  await page.waitForTimeout(120)
  await page.locator(".u1-character-sheet").evaluate((element) => {
    element.scrollBy(0, 48)
  })
  await page.waitForTimeout(520)

  await expect(page.getByRole("menu")).toHaveCount(0)
  await target.dispatchEvent("pointerup", point)

  await target.scrollIntoViewIfNeeded()
  const deliberateBox = await target.boundingBox()
  expect(deliberateBox).not.toBeNull()

  const deliberatePoint = {
    ...point,
    pointerId: 32,
    clientX: deliberateBox!.x + deliberateBox!.width / 2,
    clientY: deliberateBox!.y + deliberateBox!.height / 2,
  }

  await target.dispatchEvent("pointerdown", deliberatePoint)
  await page.waitForTimeout(560)

  await expect(page.getByRole("menu")).toBeVisible()
  await target.dispatchEvent("pointerup", deliberatePoint)
})

test("Stage 16 lets the compact spell-slot scroller hand scrolling back to the sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/e2e-character-sheet-stage16.html")

  const nested = page.getByTestId("stage16-nested-scroll")
  await nested.scrollIntoViewIfNeeded()

  const behavior = await nested.evaluate(
    (element) => getComputedStyle(element).overscrollBehaviorY,
  )
  expect(behavior).toBe("auto")

  await nested.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })

  const sheet = page.locator(".u1-character-sheet")
  const before = await sheet.evaluate((element) => element.scrollTop)

  await nested.hover()
  await page.mouse.wheel(0, 420)
  await page.waitForTimeout(120)

  const after = await sheet.evaluate((element) => element.scrollTop)
  expect(after).toBeGreaterThan(before)
})
