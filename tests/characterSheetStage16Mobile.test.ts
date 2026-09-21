import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  characterSheetHistoryStateWith,
  isCharacterSheetInternalBackTarget,
  readCharacterSheetHistory,
} from "../src/ui-v1-isolated/characterSheetHistory.ts"
import { bindTelegramBackButton } from "../src/ui-v1-isolated/telegramBackButton.ts"

const styles = fs.readFileSync(
  "src/ui-v1-isolated/styles.css",
  "utf8",
)
const shellCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-shell.css",
  "utf8",
)
const inventoryCss = fs.readFileSync(
  "src/ui-v1-isolated/character-inventory-interface.css",
  "utf8",
)
const overviewCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-overview.css",
  "utf8",
)
const triggerSource = fs.readFileSync(
  "src/ui-v1-isolated/snake/interaction/SnakeTrigger.tsx",
  "utf8",
)
const viewSource = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)

test("character sheet history preserves unrelated browser state and focused inventory item", () => {
  const snapshot = {
    characterId: "hero-1",
    kind: "interface" as const,
    interface: "inventory" as const,
    returnSection: "features" as const,
    focusedItemId: "item-42",
  }

  const state = characterSheetHistoryStateWith(
    { unrelated: { keep: true } },
    snapshot,
  )

  assert.deepEqual((state as any).unrelated, { keep: true })
  assert.deepEqual(
    readCharacterSheetHistory(state, "hero-1"),
    snapshot,
  )
})

test("character sheet history rejects stale character and malformed sections", () => {
  const valid = characterSheetHistoryStateWith(null, {
    characterId: "hero-1",
    kind: "sheet",
    section: "spells",
  })

  assert.equal(readCharacterSheetHistory(valid, "hero-2"), null)
  assert.equal(
    readCharacterSheetHistory(
      {
        characterSheet: {
          characterId: "hero-1",
          kind: "sheet",
          section: "inventory",
        },
      },
      "hero-1",
    ),
    null,
  )
})

test("old inventory history without a focused item stays backward compatible", () => {
  assert.deepEqual(
    readCharacterSheetHistory(
      {
        characterSheet: {
          characterId: "hero-1",
          kind: "interface",
          interface: "inventory",
          returnSection: "overview",
        },
      },
      "hero-1",
    ),
    {
      characterId: "hero-1",
      kind: "interface",
      interface: "inventory",
      returnSection: "overview",
      focusedItemId: null,
    },
  )
})

test("internal back detection distinguishes sheet root from nested sheet state", () => {
  assert.equal(isCharacterSheetInternalBackTarget(null), false)
  assert.equal(
    isCharacterSheetInternalBackTarget({
      characterId: "hero-1",
      kind: "sheet",
      section: "overview",
    }),
    false,
  )
  assert.equal(
    isCharacterSheetInternalBackTarget({
      characterId: "hero-1",
      kind: "sheet",
      section: "features",
    }),
    true,
  )
  assert.equal(
    isCharacterSheetInternalBackTarget({
      characterId: "hero-1",
      kind: "interface",
      interface: "inventory",
      returnSection: "spells",
      focusedItemId: "item-1",
    }),
    true,
  )
})

test("Telegram BackButton binding stays visible while route handlers detach safely", () => {
  let callback: (() => void) | null = null
  let shown = 0
  let hidden = 0
  let invoked = 0

  const cleanup = bindTelegramBackButton(
    () => {
      invoked += 1
    },
    {
      Telegram: {
        WebApp: {
          BackButton: {
            show() {
              shown += 1
            },
            hide() {
              hidden += 1
            },
            onClick(next) {
              callback = next
            },
            offClick(next) {
              if (callback === next) callback = null
            },
          },
        },
      },
    },
  )

  assert.equal(shown, 1)
  assert.equal(typeof callback, "function")
  ;(callback as () => void)()
  assert.equal(invoked, 1)

  cleanup()
  assert.equal(hidden, 0)
  assert.equal(typeof callback, "function")
  ;(callback as () => void)()
  assert.equal(invoked, 1)
})

test("Telegram BackButton binding is a no-op outside Telegram", () => {
  let invoked = 0
  const cleanup = bindTelegramBackButton(
    () => {
      invoked += 1
    },
    {},
  )

  cleanup()
  assert.equal(invoked, 0)
})

test("mobile CSS consumes Telegram safe areas and the stable Telegram viewport", () => {
  assert.match(styles, /--tg-safe-area-inset-top/)
  assert.match(styles, /--tg-content-safe-area-inset-top/)
  assert.match(styles, /--tg-safe-area-inset-bottom/)
  assert.match(styles, /--tg-content-safe-area-inset-bottom/)
  assert.match(styles, /--tg-viewport-stable-height/)
  assert.match(styles, /overscroll-behavior:\s*none/)
})

test("character sheet and inventory reserve safe sticky topbars and vertical touch scrolling", () => {
  for (const css of [shellCss, inventoryCss]) {
    assert.match(css, /top:\s*var\(--u1-safe-top\)/)
    assert.match(css, /touch-action:\s*pan-y/)
    assert.match(css, /-webkit-overflow-scrolling:\s*touch/)
    assert.match(css, /overflow-x:\s*clip/)
  }
})

test("spell-slot carousel owns horizontal swipes but leaves vertical scrolling to the parent sheet", () => {
  assert.match(
    overviewCss,
    /u1-character-overview__slot-viewport[\s\S]*scroll-snap-type:\s*x mandatory/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__slot-viewport[\s\S]*overscroll-behavior-x:\s*contain/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__slot-viewport[\s\S]*overscroll-behavior-y:\s*auto/,
  )
  assert.match(
    overviewCss,
    /u1-character-overview__slot-viewport[\s\S]*touch-action:\s*pan-x pan-y/,
  )
})

test("Snake touch long press is cancelled by scrolling before the timer fires", () => {
  assert.match(triggerSource, /cancelPendingTouchGesture/)
  assert.match(
    triggerSource,
    /window\.addEventListener\("scroll", cancelOnScroll, true\)/,
  )
  assert.match(
    triggerSource,
    /window\.removeEventListener\("scroll", cancelOnScroll, true\)/,
  )
})

test("CharacterView owns native Telegram back with the same handleBack as its visible control", () => {
  assert.match(
    viewSource,
    /bindTelegramBackButton\(handleBack, \{ priority: 100 \}\)/,
  )
  assert.match(viewSource, /window\.addEventListener\("popstate", onPopState\)/)
  assert.match(viewSource, /window\.history\.back\(\)/)
})
