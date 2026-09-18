import { expect, test, type Page } from "@playwright/test"

const mobileWidths = [320, 360, 390, 430] as const
const classKeys = [
  "fighter",
  "warlock",
  "cleric",
  "druid",
  "bard",
  "paladin",
  "sorcerer",
  "wizard",
  "rogue",
  "monk",
  "barbarian",
  "artificer",
  "ranger",
] as const

async function openFixture(page: Page, width: number, classKey = "cleric") {
  await page.setViewportSize({ width, height: 844 })
  await page.goto(`/e2e-character-spell-panels-stage6.html?class=${classKey}`)
  await expect(page.locator('[data-spell-layout="stage2"]')).toBeVisible()
}

test("Stage 6 keeps the spell screen inside 320/360/390/430 without horizontal drift", async ({ page }) => {
  for (const width of mobileWidths) {
    await openFixture(page, width)

    const metrics = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-spell-layout="stage2"]')
      const sheet = document.querySelector<HTMLElement>(".u1-character-sheet")
      const slots = Array.from(document.querySelectorAll<HTMLElement>(".u1-character-spells__slot"))
      const expanded = document.querySelector<HTMLElement>(".u1-character-spells__expanded-grid")
      const entries = expanded
        ? Array.from(expanded.querySelectorAll<HTMLElement>(":scope > .u1-character-spells__spell-entry"))
        : []
      const heads = Array.from(document.querySelectorAll<HTMLElement>(".u1-character-spells__circle-head"))

      if (!root || !sheet || slots.length !== 9 || !expanded || entries.length < 2 || !heads.length) {
        throw new Error("Stage 6 spell certification surface is incomplete")
      }

      const rootRect = root.getBoundingClientRect()
      const sheetRect = sheet.getBoundingClientRect()
      const entryRects = entries.slice(0, 2).map((entry) => entry.getBoundingClientRect())

      const headMetrics = heads.map((head) => {
        const title = head.querySelector<HTMLElement>(".u1-character-spells__circle-title")
        const count = head.querySelector<HTMLElement>(".u1-character-spells__circle-count")
        if (!title || !count) throw new Error("Circle title/count missing")
        const headRect = head.getBoundingClientRect()
        const titleRect = title.getBoundingClientRect()
        const countRect = count.getBoundingClientRect()
        return {
          left: headRect.left,
          right: headRect.right,
          titleRight: titleRect.right,
          countLeft: countRect.left,
          countRight: countRect.right,
        }
      })

      return {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        sheetLeft: sheetRect.left,
        sheetRight: sheetRect.right,
        rootClientWidth: root.clientWidth,
        rootScrollWidth: root.scrollWidth,
        slotWidths: slots.map((slot) => slot.getBoundingClientRect().width),
        entryWidths: entryRects.map((rect) => rect.width),
        entryLefts: entryRects.map((rect) => rect.left),
        entryRights: entryRects.map((rect) => rect.right),
        rootLeft: rootRect.left,
        rootRight: rootRect.right,
        headMetrics,
      }
    })

    expect(metrics.documentWidth).toBeLessThanOrEqual(width)
    expect(metrics.bodyWidth).toBeLessThanOrEqual(width)
    expect(metrics.sheetLeft).toBeGreaterThanOrEqual(-0.5)
    expect(metrics.sheetRight).toBeLessThanOrEqual(width + 0.5)
    expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 1)

    expect(Math.max(...metrics.slotWidths) - Math.min(...metrics.slotWidths)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(metrics.entryWidths[0]! - metrics.entryWidths[1]!)).toBeLessThanOrEqual(1.5)
    expect(metrics.entryLefts[0]).toBeGreaterThanOrEqual(metrics.rootLeft - 0.5)
    expect(metrics.entryRights[1]).toBeLessThanOrEqual(metrics.rootRight + 0.5)

    for (const head of metrics.headMetrics) {
      expect(head.left).toBeGreaterThanOrEqual(metrics.rootLeft - 0.5)
      expect(head.right).toBeLessThanOrEqual(metrics.rootRight + 0.5)
      expect(head.titleRight).toBeLessThanOrEqual(head.countLeft + 0.5)
      expect(head.countRight).toBeLessThanOrEqual(head.right + 0.5)
    }
  }
})

test("Stage 6 keeps the 390px reference rhythm compact and two-column", async ({ page }) => {
  await openFixture(page, 390)

  const metrics = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-spell-layout="stage2"]')
    const slotsPanel = document.querySelector<HTMLElement>(".u1-character-spells__slots-panel")
    const firstHead = document.querySelector<HTMLElement>(".u1-character-spells__circle-head")
    const grid = document.querySelector<HTMLElement>(".u1-character-spells__expanded-grid")
    const entries = grid
      ? Array.from(grid.querySelectorAll<HTMLElement>(":scope > .u1-character-spells__spell-entry"))
      : []

    if (!root || !slotsPanel || !firstHead || !grid || entries.length < 2) {
      throw new Error("390px spell reference surface missing")
    }

    const first = entries[0]!.getBoundingClientRect()
    const second = entries[1]!.getBoundingClientRect()
    const gridStyle = getComputedStyle(grid)

    return {
      rootWidth: root.getBoundingClientRect().width,
      slotsWidth: slotsPanel.getBoundingClientRect().width,
      slotsHeight: slotsPanel.getBoundingClientRect().height,
      circleHeadHeight: firstHead.getBoundingClientRect().height,
      firstWidth: first.width,
      secondWidth: second.width,
      columnGap: second.left - first.right,
      gridColumns: gridStyle.gridTemplateColumns.split(" ").filter(Boolean).length,
    }
  })

  expect(Math.abs(metrics.slotsWidth - metrics.rootWidth)).toBeLessThanOrEqual(1.5)
  expect(metrics.slotsHeight).toBeGreaterThanOrEqual(92)
  expect(metrics.slotsHeight).toBeLessThanOrEqual(140)
  expect(metrics.circleHeadHeight).toBeGreaterThanOrEqual(69)
  expect(metrics.circleHeadHeight).toBeLessThanOrEqual(72)
  expect(metrics.gridColumns).toBe(2)
  expect(Math.abs(metrics.firstWidth - metrics.secondWidth)).toBeLessThanOrEqual(1.5)
  expect(metrics.columnGap).toBeGreaterThanOrEqual(6)
  expect(metrics.columnGap).toBeLessThanOrEqual(9)
})

test("Stage 6 collapses the grimoire to one usable column at 320px", async ({ page }) => {
  await openFixture(page, 320)

  await page.getByRole("button", { name: "Открыть в гримуаре" }).click()
  await expect(page.locator(".u1-character-spells__grimoire-panel")).toBeVisible()

  const metrics = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-spell-layout="stage2"]')
    const list = document.querySelector<HTMLElement>(".u1-character-spells__grimoire-list")
    const panel = document.querySelector<HTMLElement>(".u1-character-spells__grimoire-panel")
    if (!root || !list || !panel) throw new Error("320px grimoire surface missing")

    return {
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      panelClientWidth: panel.clientWidth,
      panelScrollWidth: panel.scrollWidth,
      gridColumns: getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length,
    }
  })

  expect(metrics.gridColumns).toBe(1)
  expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 1)
  expect(metrics.panelScrollWidth).toBeLessThanOrEqual(metrics.panelClientWidth + 1)
})

test("Stage 6 clamps pathological Russian spell names instead of widening cards", async ({ page }) => {
  await openFixture(page, 320)

  const result = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".u1-character-spells__spell-card")
    const title = card?.querySelector<HTMLElement>(".u1-character-spells__spell-copy > strong")
    if (!card || !title) throw new Error("Spell card/title missing")

    title.textContent = "Невероятно длинное название защитного заклинания от всех мыслимых и немыслимых бедствий"

    const style = getComputedStyle(title)
    return {
      cardClientWidth: card.clientWidth,
      cardScrollWidth: card.scrollWidth,
      titleClientWidth: title.clientWidth,
      titleScrollWidth: title.scrollWidth,
      lineClamp: style.webkitLineClamp,
      overflow: style.overflow,
      whiteSpace: style.whiteSpace,
    }
  })

  expect(result.cardScrollWidth).toBeLessThanOrEqual(result.cardClientWidth + 1)
  expect(result.titleScrollWidth).toBeLessThanOrEqual(result.titleClientWidth + 1)
  expect(result.lineClamp).toBe("2")
  expect(result.overflow).toBe("hidden")
  expect(result.whiteSpace).toBe("normal")
})

test("Stage 6 preserves spell palette and authored class slot art for every class skin", async ({ page }) => {
  for (const classKey of classKeys) {
    await openFixture(page, 390, classKey)
    await expect(page.locator(".u1-character-spells__class-icon").first()).toBeVisible()

    const actual = await page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>(".u1-character-sheet")
      const icon = document.querySelector<HTMLElement>(".u1-character-spells__class-icon")
      if (!sheet || !icon) throw new Error("Class spell skin surface missing")
      const sheetStyle = getComputedStyle(sheet)
      const iconStyle = getComputedStyle(icon)
      return {
        accent: sheetStyle.getPropertyValue("--cv-spell-accent").trim(),
        image: iconStyle.backgroundImage,
        position: iconStyle.backgroundPosition,
      }
    })

    expect(actual.accent).not.toBe("")
    expect(
      actual.image.includes("class-spell-slots.png") || actual.image.includes("class-resources.png"),
    ).toBe(true)
    expect(actual.position).not.toBe("")
  }
})


test("Stage 6 keeps the character spell sheet informational", async ({ page }) => {
  await openFixture(page, 390)

  await expect(page.locator(".u1-character-spells__cast")).toHaveCount(0)
  await expect(page.locator(".u1-character-spells__cast-primary")).toHaveCount(0)
  await expect(page.locator(".u1-character-spells__expanded-grid .u1-character-spells__preparation")).toHaveCount(0)
  await expect(page.locator(".u1-character-spells__expanded-grid .u1-character-spells__prep-mark")).toHaveCount(0)

  const cards = page.locator(".u1-character-spells__expanded-grid .u1-character-spells__spell-card")
  await expect(cards.first()).toBeVisible()
  await expect(cards.first().locator(".u1-character-spells__spell-meta")).toBeVisible()
})


test("Stage 4 matches the reference class-level header and collapsed circle anatomy", async ({ page }) => {
  await openFixture(page, 390, "cleric")

  const header = page.locator(".u1-character-spells__slots-head [data-class-level]")
  await expect(header).toHaveText("Жрец · Ур. 5")

  const cantrips = page.locator('.u1-character-spells__circle[data-level="0"]')
  const levelOne = page.locator('.u1-character-spells__circle[data-level="1"]')
  await expect(cantrips.locator(".u1-character-spells__circle-count")).toHaveText("4 заклинания")
  await expect(levelOne.locator(".u1-character-spells__circle-count")).toHaveText("5 заклинаний")

  await expect(levelOne).toHaveAttribute("data-expanded", "true")
  await levelOne.locator(".u1-character-spells__circle-head").click()
  await expect(levelOne).not.toHaveAttribute("data-expanded", "true")
  await expect(levelOne.locator(".u1-character-spells__preview-card")).toHaveCount(3)
  await expect(levelOne.locator(".u1-character-spells__more")).toHaveText("+2")

  await cantrips.locator(".u1-character-spells__circle-head").click()
  await expect(cantrips).toHaveAttribute("data-expanded", "true")
  await expect(levelOne).not.toHaveAttribute("data-expanded", "true")
})

test("Stage 4 keeps class identity in the slots header instead of replacing it with casting-system text", async ({ page }) => {
  await openFixture(page, 390, "warlock")
  await expect(page.locator(".u1-character-spells__slots-head [data-class-level]")).toHaveText("Колдун · Ур. 5")
  await expect(page.locator(".u1-character-spells__slots-head")).not.toContainText("Магия договора")
})
