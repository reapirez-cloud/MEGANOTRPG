import { expect, test, type Page } from "@playwright/test"

async function openFixture(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 })
  await page.goto("/e2e-character-abilities-stage8.html")
  await expect(page.getByText("Сертификационный герой")).toBeVisible()
  await expect(
    page.locator('.u1-character-features__panel[data-group="class"]'),
  ).toBeVisible()
}

test("Stage 8 keeps abilities inside 320/360/390/430 mobile widths with the reference left-right hierarchy", async ({ page }) => {
  for (const width of [320, 360, 390, 430]) {
    await openFixture(page, width)

    const metrics = await page.evaluate(() => {
      const wrap = document.querySelector<HTMLElement>(
        '[data-testid="stage8-abilities-wrap"]',
      )
      const masthead = document.querySelector<HTMLElement>(
        ".u1-character-sheet__masthead",
      )
      const panels = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".u1-character-features__panel",
        ),
      )
      const first = panels[0]
      const source = first?.querySelector<HTMLElement>(
        ".u1-character-features__panel-source",
      )
      const summary = first?.querySelector<HTMLElement>(
        ".u1-character-features__panel-summary",
      )
      const head = first?.querySelector<HTMLElement>(
        ".u1-character-features__panel-head",
      )

      if (!wrap || !masthead || !first || !source || !summary || !head) {
        throw new Error("Stage 8 abilities surface missing")
      }

      const wrapRect = wrap.getBoundingClientRect()
      const mastheadRect = masthead.getBoundingClientRect()
      const firstRect = first.getBoundingClientRect()
      const headRect = head.getBoundingClientRect()
      const sourceRect = source.getBoundingClientRect()
      const summaryRect = summary.getBoundingClientRect()

      return {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        wrapClientWidth: wrap.clientWidth,
        wrapScrollWidth: wrap.scrollWidth,
        wrapLeft: wrapRect.left,
        wrapRight: wrapRect.right,
        mastheadBottom: mastheadRect.bottom,
        firstTop: firstRect.top,
        firstLeft: firstRect.left,
        firstRight: firstRect.right,
        sourceRatio: sourceRect.width / headRect.width,
        summaryRatio: summaryRect.width / headRect.width,
        panelCount: panels.length,
      }
    })

    expect(metrics.documentWidth).toBeLessThanOrEqual(width)
    expect(metrics.bodyWidth).toBeLessThanOrEqual(width)
    expect(metrics.wrapScrollWidth).toBeLessThanOrEqual(metrics.wrapClientWidth + 1)
    expect(metrics.firstLeft).toBeGreaterThanOrEqual(metrics.wrapLeft - 0.5)
    expect(metrics.firstRight).toBeLessThanOrEqual(metrics.wrapRight + 0.5)
    expect(metrics.firstTop).toBeGreaterThan(metrics.mastheadBottom)
    expect(metrics.panelCount).toBe(5)

    if (width <= 359) {
      expect(metrics.sourceRatio).toBeGreaterThanOrEqual(0.42)
      expect(metrics.sourceRatio).toBeLessThanOrEqual(0.46)
      expect(metrics.summaryRatio).toBeGreaterThanOrEqual(0.54)
      expect(metrics.summaryRatio).toBeLessThanOrEqual(0.58)
    } else {
      expect(metrics.sourceRatio).toBeGreaterThanOrEqual(0.40)
      expect(metrics.sourceRatio).toBeLessThanOrEqual(0.44)
      expect(metrics.summaryRatio).toBeGreaterThanOrEqual(0.56)
      expect(metrics.summaryRatio).toBeLessThanOrEqual(0.60)
    }
  }
})

test("Stage 8 certifies the 390px collapsed anatomy and quiet empty state", async ({ page }) => {
  await openFixture(page, 390)

  await expect(page.getByText("УМЕНИЯ", { exact: true })).toHaveCount(0)
  await expect(page.getByText("ВСЁ, ЧТО", { exact: false })).toHaveCount(0)

  const classPanel = page.locator(
    '.u1-character-features__panel[data-group="class"]',
  )
  const previewRows = classPanel.locator(".u1-character-features__preview-row")
  await expect(previewRows).toHaveCount(3)
  await expect(classPanel.locator(".u1-character-features__panel-more")).toHaveText(
    "ещё 2",
  )

  const geometry = await page.evaluate(() => {
    const classPanel = document.querySelector<HTMLElement>(
      '.u1-character-features__panel[data-group="class"]',
    )
    const backgroundPanel = document.querySelector<HTMLElement>(
      '.u1-character-features__panel[data-group="background"]',
    )
    const classHead = classPanel?.querySelector<HTMLElement>(
      ".u1-character-features__panel-head",
    )
    const emptyHead = backgroundPanel?.querySelector<HTMLElement>(
      ".u1-character-features__panel-head",
    )
    const emptyIcon = backgroundPanel?.querySelector<HTMLElement>(
      ".u1-character-features__panel-icon",
    )
    const previewIcon = classPanel?.querySelector<HTMLElement>(
      ".u1-character-features__preview-row .u1-character-features__ability-icon",
    )

    if (!classPanel || !backgroundPanel || !classHead || !emptyHead || !emptyIcon || !previewIcon) {
      throw new Error("Stage 8 collapsed geometry missing")
    }

    return {
      classHeight: classHead.getBoundingClientRect().height,
      emptyHeight: emptyHead.getBoundingClientRect().height,
      emptyIcon: emptyIcon.getBoundingClientRect().width,
      previewIcon: previewIcon.getBoundingClientRect().width,
      classClientWidth: classPanel.clientWidth,
      classScrollWidth: classPanel.scrollWidth,
      emptyOpacity: getComputedStyle(backgroundPanel).opacity,
    }
  })

  expect(geometry.classHeight).toBeGreaterThanOrEqual(91)
  expect(geometry.classHeight).toBeLessThanOrEqual(94)
  expect(geometry.emptyHeight).toBeGreaterThanOrEqual(67)
  expect(geometry.emptyHeight).toBeLessThanOrEqual(70)
  expect(geometry.emptyIcon).toBeGreaterThanOrEqual(39)
  expect(geometry.emptyIcon).toBeLessThanOrEqual(41)
  expect(geometry.previewIcon).toBeGreaterThanOrEqual(17)
  expect(geometry.previewIcon).toBeLessThanOrEqual(19)
  expect(geometry.classScrollWidth).toBeLessThanOrEqual(geometry.classClientWidth + 1)
  expect(geometry.emptyOpacity).toBe("1")

  await expect(
    page.locator('.u1-character-features__panel[data-group="background"]'),
  ).toContainText("Не назначено")
  await expect(
    page.locator('.u1-character-features__panel[data-group="background"]'),
  ).not.toContainText("Нет умений")
})

test("Stage 8 certifies compact same-panel expansion at 390px", async ({ page }) => {
  await openFixture(page, 390)

  const classPanel = page.locator(
    '.u1-character-features__panel[data-group="class"]',
  )
  await classPanel.locator(".u1-character-features__panel-source").click()
  await expect(classPanel).toHaveAttribute("data-expanded", "true")
  await expect(classPanel.locator(".u1-character-features__ability-row")).toHaveCount(5)

  const metrics = await classPanel.evaluate((panel) => {
    const expanded = panel.querySelector<HTMLElement>(
      ".u1-character-features__expanded",
    )
    const rows = Array.from(
      panel.querySelectorAll<HTMLElement>(
        ".u1-character-features__ability-row",
      ),
    )
    const icons = Array.from(
      panel.querySelectorAll<HTMLElement>(
        ".u1-character-features__ability-row > .u1-character-features__ability-icon",
      ),
    )
    const descriptions = Array.from(
      panel.querySelectorAll<HTMLElement>(
        ".u1-character-features__ability-copy > small",
      ),
    )
    if (!expanded || rows.length !== 5 || icons.length !== 5 || !descriptions.length) {
      throw new Error("Stage 8 expanded geometry missing")
    }

    return {
      panelClientWidth: panel.clientWidth,
      panelScrollWidth: panel.scrollWidth,
      rowHeights: rows.map((row) => row.getBoundingClientRect().height),
      iconWidths: icons.map((icon) => icon.getBoundingClientRect().width),
      descriptionWhiteSpace: descriptions.map(
        (description) => getComputedStyle(description).whiteSpace,
      ),
      descriptionOverflow: descriptions.map(
        (description) => getComputedStyle(description).overflow,
      ),
      expandedBackground: getComputedStyle(expanded).backgroundColor,
    }
  })

  expect(metrics.panelScrollWidth).toBeLessThanOrEqual(metrics.panelClientWidth + 1)
  for (const height of metrics.rowHeights) {
    expect(height).toBeGreaterThanOrEqual(45)
    expect(height).toBeLessThanOrEqual(48)
  }
  for (const width of metrics.iconWidths) {
    expect(width).toBeGreaterThanOrEqual(23)
    expect(width).toBeLessThanOrEqual(25)
  }
  expect(new Set(metrics.descriptionWhiteSpace)).toEqual(new Set(["nowrap"]))
  expect(new Set(metrics.descriptionOverflow)).toEqual(new Set(["hidden"]))
  expect(metrics.expandedBackground).toBe("rgba(0, 0, 0, 0)")
})

test("Stage 8 keeps the narrow 320px geometry compact without changing hierarchy", async ({ page }) => {
  await openFixture(page, 320)

  const classPanel = page.locator(
    '.u1-character-features__panel[data-group="class"]',
  )
  const backgroundPanel = page.locator(
    '.u1-character-features__panel[data-group="background"]',
  )

  let metrics = await page.evaluate(() => {
    const classHead = document.querySelector<HTMLElement>(
      '.u1-character-features__panel[data-group="class"] .u1-character-features__panel-head',
    )
    const previewIcon = document.querySelector<HTMLElement>(
      '.u1-character-features__panel[data-group="class"] .u1-character-features__preview-row .u1-character-features__ability-icon',
    )
    const emptyHead = document.querySelector<HTMLElement>(
      '.u1-character-features__panel[data-group="background"] .u1-character-features__panel-head',
    )
    const emptyIcon = document.querySelector<HTMLElement>(
      '.u1-character-features__panel[data-group="background"] .u1-character-features__panel-icon',
    )
    if (!classHead || !previewIcon || !emptyHead || !emptyIcon) {
      throw new Error("Stage 8 narrow collapsed geometry missing")
    }
    return {
      classHeight: classHead.getBoundingClientRect().height,
      previewIcon: previewIcon.getBoundingClientRect().width,
      emptyHeight: emptyHead.getBoundingClientRect().height,
      emptyIcon: emptyIcon.getBoundingClientRect().width,
    }
  })

  expect(metrics.classHeight).toBeGreaterThanOrEqual(87)
  expect(metrics.classHeight).toBeLessThanOrEqual(90)
  expect(metrics.previewIcon).toBeGreaterThanOrEqual(16)
  expect(metrics.previewIcon).toBeLessThanOrEqual(18)
  expect(metrics.emptyHeight).toBeGreaterThanOrEqual(63)
  expect(metrics.emptyHeight).toBeLessThanOrEqual(66)
  expect(metrics.emptyIcon).toBeGreaterThanOrEqual(35)
  expect(metrics.emptyIcon).toBeLessThanOrEqual(37)

  await classPanel.locator(".u1-character-features__panel-source").click()
  await expect(classPanel).toHaveAttribute("data-expanded", "true")

  metrics = await page.evaluate(() => {
    const firstRow = document.querySelector<HTMLElement>(
      '.u1-character-features__panel[data-group="class"] .u1-character-features__ability-row',
    )
    const firstIcon = document.querySelector<HTMLElement>(
      '.u1-character-features__panel[data-group="class"] .u1-character-features__ability-row > .u1-character-features__ability-icon',
    )
    const wrap = document.querySelector<HTMLElement>(
      '[data-testid="stage8-abilities-wrap"]',
    )
    if (!firstRow || !firstIcon || !wrap) {
      throw new Error("Stage 8 narrow expanded geometry missing")
    }
    return {
      classHeight: firstRow.getBoundingClientRect().height,
      previewIcon: firstIcon.getBoundingClientRect().width,
      emptyHeight: wrap.clientWidth,
      emptyIcon: wrap.scrollWidth,
    }
  })

  expect(metrics.classHeight).toBeGreaterThanOrEqual(43)
  expect(metrics.classHeight).toBeLessThanOrEqual(46)
  expect(metrics.previewIcon).toBeGreaterThanOrEqual(21)
  expect(metrics.previewIcon).toBeLessThanOrEqual(23)
  expect(metrics.emptyIcon).toBeLessThanOrEqual(metrics.emptyHeight + 1)

  await expect(backgroundPanel).toBeVisible()
})

test("Stage 8 keeps suppressed rows visible in place instead of hiding them", async ({ page }) => {
  await openFixture(page, 390)

  const effectPanel = page.locator(
    '.u1-character-features__panel[data-group="effect"]',
  )
  const suppressedPreview = effectPanel.locator(
    ".u1-character-features__preview-row[data-suppressed]",
  )
  await expect(suppressedPreview).toBeVisible()

  const style = await suppressedPreview.evaluate((row) => {
    const computed = getComputedStyle(row)
    return {
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      filter: computed.filter,
    }
  })

  expect(style.display).not.toBe("none")
  expect(style.visibility).not.toBe("hidden")
  expect(Number(style.opacity)).toBeGreaterThan(0.4)
  expect(Number(style.opacity)).toBeLessThan(0.5)
  expect(style.filter).toContain("grayscale")
})
