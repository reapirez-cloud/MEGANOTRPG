import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)
const features = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetFeatures.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-features.css",
  "utf8",
)

test("abilities panel shell consumes one runtime-owned read model instead of rebuilding CE in the component", () => {
  assert.match(
    view,
    /buildCharacterAbilitiesReadModel\(\{[\s\S]*?contract: snapshot\.contract/,
  )
  assert.match(
    view,
    /contributions: snapshot\.input\.contributions/,
  )
  assert.match(view, /sourceNodes: snapshot\.sourceNodes/)
  assert.match(view, /templateBundles: runtime\.templates\.bundles/)
  assert.match(
    view,
    /\.\.\.runtime\.templates\.suppressions\.sourceIds[\s\S]*?\.\.\.runtime\.preparation\.suppressedSourceIds/,
  )
  assert.match(
    view,
    /<CharacterSheetFeatures[\s\S]*?model=\{abilitiesReadModel\}/,
  )
  assert.doesNotMatch(features, /resolveCharacter|supabase|useResolvedCharacterRuntime/)
})

test("abilities tab stage 2 renders the five-group read model as one stable panel stack", () => {
  assert.match(features, /model\.groups\.map\(\(group\) =>/)
  assert.match(features, /className="u1-character-features__panels"/)
  assert.match(features, /className="u1-character-features__panel"/)
  assert.match(features, /data-group=\{group\.key\}/)
  assert.match(features, /className="u1-character-features__panel-source"/)
  assert.match(features, /className="u1-character-features__panel-summary"/)
  assert.match(features, /<AbilityGroupIcon group=\{group\.key\}/)
  assert.match(features, /<strong>\{group\.label\}<\/strong>/)
  assert.match(features, /<small>\{sourceSummary\(group\)\}<\/small>/)
})

test("stage 2 preserves the approved Meganot visual system rather than copying the reference skin", () => {
  assert.match(styles, /var\(--cv-text\)/)
  assert.match(styles, /var\(--cv-accent\)/)
  assert.match(styles, /var\(--cv-surface\)/)
  assert.match(
    styles,
    /\.u1-character-features__panel-head\s*\{[\s\S]*?grid-template-columns:/,
  )
  assert.match(
    styles,
    /\.u1-character-features__panel-source\s*\{[\s\S]*?grid-template-columns:/,
  )
  assert.doesNotMatch(styles, /gold|#d4af37|#ffd700/i)
})

test("the finished shell keeps the stage 2 foundation without temporary milestone markers", () => {
  assert.match(features, /aria-labelledby="character-abilities-title"/)
  assert.doesNotMatch(features, /data-stage=/)
  assert.doesNotMatch(features, /CHARACTER_SHEET_FEATURE_SOURCE_ORDER/)
  assert.doesNotMatch(features, /ContextActionSheet|useLongPressItem/)
})
