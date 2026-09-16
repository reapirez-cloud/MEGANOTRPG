import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  CHARACTER_SHEET_CANONICAL_CLASS_KEYS,
  normalizeCharacterSheetClassKey,
  resolveCharacterSheetClassKey,
} from "../src/ui-v1-isolated/characterSheetClassKey.ts"
import {
  characterSheetClassResourceAsset,
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

test("class glass no longer defaults to graphite-dominant surfaces", () => {
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

  assert.match(theme, /--cv-glass:/)
  assert.match(theme, /var\(--cv-ambient-art\)/)
  assert.match(core, /var\(--cv-glass\)/)
  assert.match(
    overview,
    /color-mix\(in srgb, var\(--cv-resource-accent\) 19%, rgba\(12,13,14,\.22\)\)/,
  )
  assert.match(
    overview,
    /color-mix\(in srgb, var\(--cv-spell-accent\) 19%, rgba\(12,13,14,\.22\)\)/,
  )
})
