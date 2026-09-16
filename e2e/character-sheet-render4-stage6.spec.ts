import { expect, test } from "@playwright/test"

const preparedClassKeys = [
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

test("Render 4 fits hero, rail, 50/50 core and overview at 360/390/412", async ({ page }) => {
  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto("/e2e-character-sheet-stage16.html")

    const metrics = await page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>(".u1-character-sheet")
      const hero = document.querySelector<HTMLElement>(".u1-character-sheet__masthead")
      const identity = document.querySelector<HTMLElement>(".u1-character-sheet__identity")
      const rail = document.querySelector<HTMLElement>(".u1-character-sheet__rail")
      const railList = document.querySelector<HTMLElement>(".u1-character-sheet__rail-list")
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".u1-character-sheet__rail-row"))
      const core = document.querySelector<HTMLElement>('[data-testid="stage16-core"]')
      const left = document.querySelector<HTMLElement>('[data-testid="stage16-core-left"]')
      const right = document.querySelector<HTMLElement>('[data-testid="stage16-core-right"]')
      const resources = document.querySelector<HTMLElement>('[data-testid="stage16-resources"]')
      const slots = document.querySelector<HTMLElement>('[data-testid="stage16-slots"]')
      const slotViewport = document.querySelector<HTMLElement>('[data-testid="stage16-nested-scroll"]')
      const firstSlot = slotViewport?.querySelector<HTMLElement>(".u1-character-overview__slot")

      if (!sheet || !hero || !identity || !rail || !railList || !core || !left || !right || !resources || !slots || !slotViewport || !firstSlot) {
        throw new Error("Render 4 certification surface is incomplete")
      }

      const sheetRect = sheet.getBoundingClientRect()
      const heroRect = hero.getBoundingClientRect()
      const identityRect = identity.getBoundingClientRect()
      const railRect = rail.getBoundingClientRect()
      const coreRect = core.getBoundingClientRect()
      const leftRect = left.getBoundingClientRect()
      const rightRect = right.getBoundingClientRect()
      const resourcesRect = resources.getBoundingClientRect()
      const slotsRect = slots.getBoundingClientRect()
      const slotViewportRect = slotViewport.getBoundingClientRect()
      const slotRowRect = firstSlot.getBoundingClientRect()

      return {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        sheetLeft: sheetRect.left,
        sheetRight: sheetRect.right,
        heroHeight: heroRect.height,
        identityRight: identityRect.right,
        railLeft: railRect.left,
        railClientHeight: railList.clientHeight,
        railScrollHeight: railList.scrollHeight,
        railRows: rows.length,
        railRowHeight: rows[0]?.getBoundingClientRect().height || 0,
        coreWidth: coreRect.width,
        leftWidth: leftRect.width,
        rightWidth: rightRect.width,
        resourcesWidth: resourcesRect.width,
        slotsWidth: slotsRect.width,
        slotViewportHeight: slotViewportRect.height,
        slotRowHeight: slotRowRect.height,
        slotScrollHeight: slotViewport.scrollHeight,
        slotClientWidth: slotViewport.clientWidth,
        slotScrollWidth: slotViewport.scrollWidth,
      }
    })

    const expectedHero = Math.max(220, Math.min(width * 0.614, 292))

    expect(metrics.documentWidth).toBeLessThanOrEqual(width)
    expect(metrics.bodyWidth).toBeLessThanOrEqual(width)
    expect(metrics.sheetLeft).toBeGreaterThanOrEqual(-0.5)
    expect(metrics.sheetRight).toBeLessThanOrEqual(width + 0.5)
    expect(Math.abs(metrics.heroHeight - expectedHero)).toBeLessThanOrEqual(1.5)

    expect(metrics.railRows).toBe(4)
    expect(metrics.railScrollHeight).toBeGreaterThan(metrics.railClientHeight)
    expect(Math.abs(metrics.railClientHeight - metrics.railRowHeight * 3)).toBeLessThanOrEqual(1.5)
    expect(metrics.identityRight).toBeLessThanOrEqual(metrics.railLeft + 0.5)

    expect(Math.abs(metrics.leftWidth - metrics.rightWidth)).toBeLessThanOrEqual(2)
    expect(Math.abs(metrics.resourcesWidth - metrics.coreWidth)).toBeLessThanOrEqual(2)
    expect(Math.abs(metrics.slotsWidth - metrics.coreWidth)).toBeLessThanOrEqual(2)

    expect(Math.abs(metrics.slotViewportHeight - metrics.slotRowHeight * 2)).toBeLessThanOrEqual(2)
    expect(metrics.slotScrollHeight).toBeLessThanOrEqual(metrics.slotViewportHeight + 1)
    expect(metrics.slotScrollWidth).toBeGreaterThan(metrics.slotClientWidth)
  }
})

test("Render 4 keeps a long character name inside the hero identity zone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 })
  await page.goto("/e2e-character-sheet-stage16.html")

  const result = await page.evaluate(() => {
    const name = document.querySelector<HTMLElement>(".u1-character-sheet__identity strong")
    const rail = document.querySelector<HTMLElement>(".u1-character-sheet__rail")
    if (!name || !rail) throw new Error("Hero identity or rail missing")

    name.textContent = "Вильям Кидд фон Меганотский, Хранитель Последней Очень Длинной Печати"

    const nameRect = name.getBoundingClientRect()
    const railRect = rail.getBoundingClientRect()
    const style = getComputedStyle(name)

    return {
      clientWidth: name.clientWidth,
      scrollWidth: name.scrollWidth,
      right: nameRect.right,
      railLeft: railRect.left,
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    }
  })

  expect(result.scrollWidth).toBeGreaterThan(result.clientWidth)
  expect(result.right).toBeLessThanOrEqual(result.railLeft + 0.5)
  expect(result.overflow).toBe("hidden")
  expect(result.textOverflow).toBe("ellipsis")
  expect(result.whiteSpace).toBe("nowrap")
})

test("Render 4 class skins expose authored accent and built-in art for all prepared classes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/e2e-character-sheet-stage16.html")

  for (const classKey of preparedClassKeys) {
    const values = await page.evaluate((nextClassKey) => {
      const sheet = document.querySelector<HTMLElement>(".u1-character-sheet")
      if (!sheet) throw new Error("Character sheet missing")

      sheet.dataset.classKey = nextClassKey
      const style = getComputedStyle(sheet)

      return {
        accent: style.getPropertyValue("--cv-accent").trim(),
        fallback: style.getPropertyValue("--cv-class-panel-art-fallback").trim(),
      }
    }, classKey)

    expect(values.accent).not.toBe("")
    expect(values.fallback).toContain("data:image/webp;base64")
  }
})

test("Render 4 spent icons keep the same authored PNG and add the red cross overlay", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/e2e-character-sheet-stage16.html")

  const values = await page.evaluate(() => {
    const spent = document.querySelector<HTMLElement>(
      '.u1-character-overview__charge[data-state="spent"]',
    )
    const icon = spent?.querySelector<HTMLElement>("i")
    if (!spent || !icon) throw new Error("Spent certification icon missing")

    const iconStyle = getComputedStyle(icon)
    const overlayStyle = getComputedStyle(spent, "::after")

    return {
      image: iconStyle.backgroundImage,
      filter: iconStyle.filter,
      overlay: overlayStyle.backgroundImage,
      overlayOpacity: Number.parseFloat(overlayStyle.opacity),
    }
  })

  expect(values.image).toContain("class-resources.png")
  expect(values.filter).toContain("grayscale(1)")
  expect(values.overlay).toContain("spent-resource-cross.png")
  expect(values.overlayOpacity).toBeGreaterThan(0.9)
})

test("Render 4 rail scrolls vertically while nine spell levels page horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/e2e-character-sheet-stage16.html")

  const values = await page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>(".u1-character-sheet__rail-list")
    const slots = document.querySelector<HTMLElement>('[data-testid="stage16-nested-scroll"]')
    if (!rail || !slots) throw new Error("Nested scrollers missing")

    rail.scrollTop = rail.scrollHeight
    slots.scrollLeft = slots.scrollWidth

    return {
      railTop: rail.scrollTop,
      railMax: rail.scrollHeight - rail.clientHeight,
      slotLeft: slots.scrollLeft,
      slotMax: slots.scrollWidth - slots.clientWidth,
      railBehavior: getComputedStyle(rail).overscrollBehaviorY,
      slotBehaviorX: getComputedStyle(slots).overscrollBehaviorX,
      slotBehaviorY: getComputedStyle(slots).overscrollBehaviorY,
      slotSnap: getComputedStyle(slots).scrollSnapType,
    }
  })

  expect(values.railTop).toBeGreaterThan(0)
  expect(Math.abs(values.railTop - values.railMax)).toBeLessThanOrEqual(1)
  expect(values.slotLeft).toBeGreaterThan(0)
  expect(Math.abs(values.slotLeft - values.slotMax)).toBeLessThanOrEqual(1)
  expect(values.railBehavior).toBe("contain")
  expect(values.slotBehaviorX).toBe("contain")
  expect(values.slotBehaviorY).toBe("auto")
  expect(values.slotSnap).toContain("x")
})
