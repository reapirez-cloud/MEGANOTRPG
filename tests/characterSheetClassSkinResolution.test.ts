import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  CHARACTER_SHEET_CANONICAL_CLASS_KEYS,
  normalizeCharacterSheetClassKey,
  resolveCharacterSheetClassKey,
} from "../src/ui-v1-isolated/characterSheetClassKey.ts"
import {
  CHARACTER_SHEET_AUTHORED_CLASS_KEYS,
  characterSheetClassResourceAsset,
  characterSheetPortraitFrameUrl,
  characterSheetSpellSlotAsset,
} from "../src/ui-v1-isolated/characterSheetVisualAssets.ts"

test("catalog and -core template identities resolve to canonical sheet class keys", () => {
  for (const classKey of CHARACTER_SHEET_CANONICAL_CLASS_KEYS) {
    assert.equal(
      normalizeCharacterSheetClassKey(`class:${classKey}`),
      classKey,
    )
    assert.equal(
      normalizeCharacterSheetClassKey(`${classKey}-core`),
      classKey,
    )
  }
})

test("William Kidd cleric assignment resolves to cleric instead of fallback", () => {
  const classKey = resolveCharacterSheetClassKey({
    characterClass: "Жрец",
    assignedClass: {
      slug: "cleric-core",
      catalog_key: "class:cleric",
    },
  })

  assert.equal(classKey, "cleric")
  assert.equal(
    characterSheetClassResourceAsset(classKey).url,
    "/ui-v1/character-sheet/icons/class-resources.png",
  )
  assert.equal(
    characterSheetSpellSlotAsset(classKey).url,
    "/ui-v1/character-sheet/icons/class-spell-slots.png",
  )
})

test("every authored class ships a lossless portrait frame fallback", () => {
  for (const classKey of CHARACTER_SHEET_AUTHORED_CLASS_KEYS) {
    const url = characterSheetPortraitFrameUrl(classKey)
    assert.equal(
      url,
      `/ui-v1/character-sheet/portrait-frames/${classKey}.png`,
    )
    assert.equal(
      fs.existsSync(`public${url}`),
      true,
      `missing portrait frame for ${classKey}`,
    )
  }

  assert.equal(characterSheetPortraitFrameUrl("default"), null)
})

test("framed avatars are clipped beneath a non-distorted PNG overlay", () => {
  const shell = fs.readFileSync(
    "src/ui-v1-isolated/character-sheet-shell.css",
    "utf8",
  )

  assert.match(shell, /portrait-frame-stack[\s\S]*aspect-ratio:\s*9\s*\/\s*16/)
  assert.match(
    shell,
    /portrait-frame-stack \.u1-character-sheet__portrait-media[\s\S]*inset:\s*6% 10\.5% 6\.5%/,
  )
  assert.match(shell, /u1-character-sheet__portrait-frame[\s\S]*object-fit:\s*contain/)
})

test("background art owns the palette while panels remain neutral dark glass", () => {
  const theme = fs.readFileSync(
    "src/ui-v1-isolated/character-sheet-theme.css",
    "utf8",
  )
  const core = fs.readFileSync(
    "src/ui-v1-isolated/character-sheet-core.css",
    "utf8",
  )
  const overview = fs.readFileSync(
    "src/ui-v1-isolated/character-sheet-overview.css",
    "utf8",
  )

  assert.match(theme, /--cv-panel-glass:\s*rgba\(5, 6, 7, \.55\)/)
  assert.match(theme, /--cv-art-highlight:/)
  assert.match(theme, /var\(--cv-class-art-wash\)/)
  assert.match(
    theme,
    /u1-character-sheet__fixed-backdrop[\s\S]*var\(--cv-ambient-art\)/,
  )
  assert.match(core, /background:\s*var\(--cv-panel-glass\)/)
  assert.match(
    overview,
    /u1-character-overview__section,[\s\S]*background:\s*var\(--cv-panel-glass\)/,
  )
})
