import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const spells = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetSpells.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-spells.css",
  "utf8",
)

test("spell stage 3 gives every spell a stable atlas icon instead of the class slot icon", () => {
  assert.match(spells, /SPELL_CARD_ICON_ATLAS/)
  assert.match(spells, /function stableHash/)
  assert.match(spells, /function spellCardIconStyle\(view: SpellView\)/)
  assert.match(spells, /style=\{spellCardIconStyle\(view\)\}/)
  assert.match(styles, /background-image:\s*var\(--u1-spell-card-icon\)/)
})

test("spell stage 3 exposes casting time and spell flags on expanded cards", () => {
  assert.match(spells, /function castingTimeLabel\(view: SpellView\)/)
  assert.match(spells, /\{castingTimeLabel\(view\)\}/)
  assert.match(spells, /data-concentration=\{view\.concentration \|\| undefined\}/)
  assert.match(spells, /data-ritual=\{view\.ritual \|\| undefined\}/)
  assert.match(spells, /view\.concentration && <em>Концентрация<\/em>/)
  assert.match(spells, /view\.ritual && <em>Ритуал<\/em>/)
})

test("spell stage 3 makes preparation state readable without opening details", () => {
  assert.match(spells, /preparationShortLabels/)
  assert.match(spells, /className="u1-character-spells__prep-mark"/)
  assert.match(spells, /className="u1-character-spells__preparation"/)
  assert.match(styles, /\.u1-character-spells__prep-mark\[data-state="prepared"\]/)
  assert.match(styles, /\.u1-character-spells__preparation\[data-state="always_prepared"\]/)
})

test("spell stage 3 keeps stage 2 two-column geometry and class theming", () => {
  assert.match(styles, /\.u1-character-spells__expanded-grid[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(styles, /var\(--cv-spell-accent\)/)
  assert.match(styles, /var\(--cv-spell-accent-soft\)/)
  assert.match(spells, /className="u1-character-spells__preview-card"/)
  assert.match(spells, /className="u1-character-spells__spell-card"/)
})
