import {
  expect,
  test,
  type Page,
  type TestInfo,
} from "@playwright/test"

const mobileWidths = [320, 360, 390, 430] as const

async function openFixture(
  page: Page,
  width: number,
  manager = false,
) {
  await page.setViewportSize({ width, height: 844 })
  await page.goto(
    "/e2e-character-proficiencies-stage7.html" +
      (manager ? "?manager=1" : ""),
  )
  await expect(page.getByText("Сертификационный герой")).toBeVisible()
  await expect(
    page.locator(".u1-character-proficiencies__panel"),
  ).toHaveCount(5)
}

test("Stage 7 keeps all five proficiency panels inside 320/360/390/430 mobile widths", async ({ page }) => {
  for (const width of mobileWidths) {
    await openFixture(page, width)

    const metrics = await page.evaluate(() => {
      const wrap = document.querySelector<HTMLElement>(
        '[data-testid="stage7-proficiencies-wrap"]',
      )
      const panels = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".u1-character-proficiencies__panel",
        ),
      )
      const tags = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".u1-character-proficiencies__tag",
        ),
      )

      if (!wrap || panels.length !== 5 || !tags.length) {
        throw new Error("Stage 7 proficiency surface missing")
      }

      const wrapRect = wrap.getBoundingClientRect()

      return {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        wrapClientWidth: wrap.clientWidth,
        wrapScrollWidth: wrap.scrollWidth,
        wrapLeft: wrapRect.left,
        wrapRight: wrapRect.right,
        panelRects: panels.map((panel) => {
          const rect = panel.getBoundingClientRect()
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            scrollWidth: panel.scrollWidth,
            clientWidth: panel.clientWidth,
          }
        }),
        tagRects: tags.map((tag) => {
          const rect = tag.getBoundingClientRect()
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
          }
        }),
      }
    })

    expect(metrics.documentWidth).toBeLessThanOrEqual(width)
    expect(metrics.bodyWidth).toBeLessThanOrEqual(width)
    expect(metrics.wrapScrollWidth).toBeLessThanOrEqual(
      metrics.wrapClientWidth + 1,
    )

    for (const panel of metrics.panelRects) {
      expect(panel.left).toBeGreaterThanOrEqual(metrics.wrapLeft - 0.5)
      expect(panel.right).toBeLessThanOrEqual(metrics.wrapRight + 0.5)
      expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1)
    }

    for (const tag of metrics.tagRects) {
      expect(tag.left).toBeGreaterThanOrEqual(metrics.wrapLeft - 0.5)
      expect(tag.right).toBeLessThanOrEqual(metrics.wrapRight + 0.5)
      expect(tag.width).toBeLessThanOrEqual(metrics.wrapClientWidth + 1)
    }
  }
})

test("Stage 7 locks the compact 390px reference anatomy", async ({ page }) => {
  await openFixture(page, 390)

  const metrics = await page.evaluate(() => {
    const first = document.querySelector<HTMLElement>(
      '.u1-character-proficiencies__panel[data-group="weapons"]',
    )
    const head = first?.querySelector<HTMLElement>(
      ".u1-character-proficiencies__head",
    )
    const icon = first?.querySelector<HTMLElement>(
      ".u1-character-proficiencies__icon",
    )
    const identity = first?.querySelector<HTMLElement>(
      ".u1-character-proficiencies__identity",
    )
    const tail = first?.querySelector<HTMLElement>(
      ".u1-character-proficiencies__tail",
    )

    if (!first || !head || !icon || !identity || !tail) {
      throw new Error("Stage 7 390px geometry missing")
    }

    const headRect = head.getBoundingClientRect()
    const iconRect = icon.getBoundingClientRect()
    const identityRect = identity.getBoundingClientRect()
    const tailRect = tail.getBoundingClientRect()

    return {
      panelRight: first.getBoundingClientRect().right,
      headHeight: headRect.height,
      iconWidth: iconRect.width,
      iconRatio: iconRect.width / headRect.width,
      identityLeft: identityRect.left,
      identityRight: identityRect.right,
      tailLeft: tailRect.left,
      tailRight: tailRect.right,
      panelClientWidth: first.clientWidth,
      panelScrollWidth: first.scrollWidth,
    }
  })

  expect(metrics.headHeight).toBeGreaterThanOrEqual(83)
  expect(metrics.headHeight).toBeLessThanOrEqual(86)
  expect(metrics.iconWidth).toBeGreaterThanOrEqual(51)
  expect(metrics.iconWidth).toBeLessThanOrEqual(54)
  expect(metrics.iconRatio).toBeGreaterThan(0.12)
  expect(metrics.iconRatio).toBeLessThan(0.16)
  expect(metrics.identityRight).toBeLessThanOrEqual(metrics.tailLeft + 0.5)
  expect(metrics.tailRight).toBeLessThanOrEqual(
    metrics.panelRight + 0.5,
  )
  expect(metrics.panelScrollWidth).toBeLessThanOrEqual(
    metrics.panelClientWidth + 1,
  )
})

test("Stage 7 keeps an empty category quiet, explicit and geometrically intact", async ({ page }) => {
  await openFixture(page, 390)

  const armor = page.locator(
    '.u1-character-proficiencies__panel[data-group="armor"]',
  )
  await expect(armor).toHaveAttribute("data-empty", "true")
  await expect(
    armor.locator(".u1-character-proficiencies__tail > strong"),
  ).toHaveText("0 / 4")
  await expect(armor).toContainText("Нет владений этого типа")

  const metrics = await armor.evaluate((panel) => ({
    clientWidth: panel.clientWidth,
    scrollWidth: panel.scrollWidth,
    height: panel.getBoundingClientRect().height,
  }))

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
  expect(metrics.height).toBeGreaterThan(105)
})

test("Stage 7 keeps long tool and language catalogs wrapping inside their panels", async ({ page }) => {
  await openFixture(page, 320)

  const result = await page.evaluate(() => {
    const tools = document.querySelector<HTMLElement>(
      '.u1-character-proficiencies__panel[data-group="tools"]',
    )
    const languages = document.querySelector<HTMLElement>(
      '.u1-character-proficiencies__panel[data-group="languages"]',
    )
    const toolTags = tools
      ? Array.from(
          tools.querySelectorAll<HTMLElement>(
            ".u1-character-proficiencies__tag",
          ),
        )
      : []
    const languageTags = languages
      ? Array.from(
          languages.querySelectorAll<HTMLElement>(
            ".u1-character-proficiencies__tag",
          ),
        )
      : []

    if (!tools || !languages || toolTags.length < 10 || languageTags.length < 8) {
      throw new Error("Large catalog fixture missing")
    }

    const firstToolTop = toolTags[0]!.getBoundingClientRect().top
    const laterToolTop = toolTags.at(-1)!.getBoundingClientRect().top
    const firstLanguageTop = languageTags[0]!.getBoundingClientRect().top
    const laterLanguageTop = languageTags.at(-1)!.getBoundingClientRect().top

    return {
      toolClientWidth: tools.clientWidth,
      toolScrollWidth: tools.scrollWidth,
      languageClientWidth: languages.clientWidth,
      languageScrollWidth: languages.scrollWidth,
      toolWrapped: laterToolTop > firstToolTop,
      languageWrapped: laterLanguageTop > firstLanguageTop,
      toolHeight: tools.getBoundingClientRect().height,
      languageHeight: languages.getBoundingClientRect().height,
    }
  })

  expect(result.toolScrollWidth).toBeLessThanOrEqual(result.toolClientWidth + 1)
  expect(result.languageScrollWidth).toBeLessThanOrEqual(
    result.languageClientWidth + 1,
  )
  expect(result.toolWrapped).toBe(true)
  expect(result.languageWrapped).toBe(true)
  expect(result.toolHeight).toBeGreaterThan(150)
  expect(result.languageHeight).toBeGreaterThan(130)
})

test("Stage 7 accordion panels remain independent and keep the sheet scroll position stable", async ({ page }) => {
  await openFixture(page, 390)

  const weapons = page.locator(
    '.u1-character-proficiencies__panel[data-group="weapons"]',
  )
  const armor = page.locator(
    '.u1-character-proficiencies__panel[data-group="armor"]',
  )

  await expect(weapons).toHaveAttribute("data-expanded", "true")
  await expect(armor).toHaveAttribute("data-expanded", "true")

  const before = await page.locator(".u1-character-sheet").evaluate(
    (sheet) => sheet.scrollTop,
  )

  await weapons.locator(".u1-character-proficiencies__head").click()
  await expect(weapons).toHaveAttribute("data-expanded", "false")
  await expect(armor).toHaveAttribute("data-expanded", "true")

  await armor.locator(".u1-character-proficiencies__head").click()
  await expect(weapons).toHaveAttribute("data-expanded", "false")
  await expect(armor).toHaveAttribute("data-expanded", "false")

  const after = await page.locator(".u1-character-sheet").evaluate(
    (sheet) => sheet.scrollTop,
  )
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2)
})

test("Stage 7 keeps suppressed proficiencies visible but excludes them from the effective counter", async ({ page }) => {
  await openFixture(page, 390)

  const languages = page.locator(
    '.u1-character-proficiencies__panel[data-group="languages"]',
  )
  await expect(
    languages.locator(".u1-character-proficiencies__tail > strong"),
  ).toHaveText("9")

  const suppressed = languages.locator(
    '.u1-character-proficiencies__tag[data-suppressed="true"]',
  )
  await expect(suppressed).toHaveText(/Глубинная речь/)

  const style = await suppressed.evaluate((tag) => {
    const computed = getComputedStyle(tag)
    return {
      display: computed.display,
      visibility: computed.visibility,
      opacity: Number(computed.opacity),
      filter: computed.filter,
      maxWidth: computed.maxWidth,
      whiteSpace: computed.whiteSpace,
    }
  })

  expect(style.display).not.toBe("none")
  expect(style.visibility).not.toBe("hidden")
  expect(style.opacity).toBeGreaterThan(0.4)
  expect(style.opacity).toBeLessThan(0.5)
  expect(style.filter).toContain("grayscale")
  expect(style.maxWidth).toBe("100%")
  expect(style.whiteSpace).toBe("normal")
})

async function openSourceBranch(
  page: Page,
  manager: boolean,
) {
  await openFixture(page, 390, manager)
  const tag = page
    .locator(
      '.u1-character-proficiencies__panel[data-group="weapons"] .u1-character-proficiencies__tag',
    )
    .first()
  await tag.click({ button: "right" })
  await expect(page.getByRole("menu")).toBeVisible()
  await page.getByText("Источник", { exact: true }).click()
}

test("Stage 7 player Snake exposes provenance without mutation commands", async ({ page }) => {
  await openSourceBranch(page, false)

  await expect(
    page.getByText("Подробнее об источнике", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Заглушить источник", { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByText("Включить источник", { exact: true }),
  ).toHaveCount(0)
})

test("Stage 7 manager Snake exposes the canonical granular suppression command", async ({ page }) => {
  await openSourceBranch(page, true)

  await expect(
    page.getByText("Подробнее об источнике", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Заглушить источник", { exact: true }),
  ).toBeVisible()
})

test("Stage 7 emits a deterministic 390px visual certification screenshot artifact", async ({ page }, testInfo: TestInfo) => {
  await openFixture(page, 390)
  const screenshot = await page.screenshot({
    fullPage: true,
    animations: "disabled",
  })

  expect(screenshot.byteLength).toBeGreaterThan(10_000)
  await testInfo.attach("proficiencies-stage7-390.png", {
    body: screenshot,
    contentType: "image/png",
  })
})
