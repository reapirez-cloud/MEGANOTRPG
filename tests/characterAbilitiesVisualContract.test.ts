import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const features = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetFeatures.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-features.css",
  "utf8",
)
const contract = fs.readFileSync(
  "docs/ABILITIES_VISUAL_REWORK_CONTRACT.md",
  "utf8",
)

test("abilities v2 stage 1 removes the foreign visible heading and slogan", () => {
  assert.doesNotMatch(features, />\s*УМЕНИЯ\s*</)
  assert.doesNotMatch(
    features,
    /Всё, что делает персонажа тем, кто он есть/i,
  )
  assert.doesNotMatch(features, /u1-character-features__intro/)
  assert.doesNotMatch(styles, /u1-character-features__intro/)
  assert.match(features, /aria-label="Умения персонажа"/)
})

test("abilities owns panels only and cannot replace the existing sheet scene", () => {
  assert.doesNotMatch(
    features,
    /u1-character-sheet__masthead|u1-character-sheet__portrait|cv-ambient-art|cv-class-panel-art/,
  )
  assert.doesNotMatch(
    styles,
    /\.u1-character-features\s*\{[^}]*background(?:-image|-color)?\s*:/s,
  )
})

test("abilities reuses the Character and Spells sheet language instead of defining a third theme", () => {
  assert.match(styles, /var\(--cv-text\)/)
  assert.match(styles, /var\(--cv-text-muted\)/)
  assert.match(styles, /var\(--cv-line\)/)
  assert.match(styles, /var\(--cv-line-soft\)/)
  assert.match(styles, /var\(--cv-accent\)/)
  assert.doesNotMatch(styles, /--abilities-(?:canvas|surface|theme|font|palette)/)
})

test("visual rewrite preserves the existing read-model, Snake and suppression wiring", () => {
  assert.match(features, /CharacterAbilitiesReadModel/)
  assert.match(features, /characterAbilityCollapsedPreview/)
  assert.match(features, /SnakeTrigger, useSnake/)
  assert.match(features, /createCharacterAbilitySnakeActions/)
  assert.match(features, /onSetSuppressed/)
})

test("repository contract limits the external reference to panel geometry", () => {
  assert.match(
    contract,
    /reference image describes \*\*panel composition only\*\*/i,
  )
  assert.match(
    contract,
    /character-sheet shell already owns the visual scene/i,
  )
  assert.match(contract, /character masthead \/ portrait block/i)
  assert.match(contract, /class artwork\/background behind the sheet/i)
  assert.match(
    contract,
    /Abilities does not own a third theme/i,
  )
  assert.match(
    contract,
    /Character and Spells/i,
  )
  assert.match(contract, /Stage 1 acceptance/)
})


test("abilities v2 stage 2 keeps more-count and chevron in a compact right-side tail", () => {
  assert.match(
    features,
    /className="u1-character-features__preview"[\s\S]*?preview\.rows\.map/,
  )
  assert.match(
    features,
    /className="u1-character-features__panel-tail"[\s\S]*?className="u1-character-features__panel-more"[\s\S]*?ещё \{preview\.hiddenCount\}[\s\S]*?className="u1-character-features__panel-chevron-button"/,
  )
  assert.match(
    styles,
    /\.u1-character-features__panel-tail\s*\{[\s\S]*?display:\s*inline-flex[\s\S]*?justify-content:\s*flex-end/,
  )
  assert.match(contract, /## Stage 2 acceptance/)
})


test("abilities v2 stage 3 uses shared class tokens instead of an abilities-only skin", () => {
  assert.match(contract, /Status: \*\*ACTIVE — Stage 3 locked\*\*/)
  assert.match(contract, /## Stage 3 acceptance/)
  assert.match(styles, /background:[\s\S]*?var\(--cv-surface-soft\)/)
  assert.match(styles, /border: 1px solid var\(--cv-accent-line\)/)
  assert.match(styles, /var\(--cv-accent-soft\)/)
  assert.match(styles, /color: var\(--cv-accent\)/)
  assert.doesNotMatch(
    styles,
    /color-mix\(in srgb, var\(--cv-surface\)|radial-gradient\(\s*circle at 16% 18%/,
  )
  assert.doesNotMatch(
    styles,
    /--abilities-(?:glass|border|accent|surface|shadow|radius)/,
  )
})