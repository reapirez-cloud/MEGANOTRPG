import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/migrations/20260829162500_voss_reference_voice_contract.sql", "utf8")
const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const voice = fs.readFileSync("src/data/vossVoice.ts", "utf8")

test("Voss package declares explanation -> rule -> comment and remains presentation-only", () => {
  assert.match(migration, /CLASS_PACKAGE_TEST: tests\/vossReferenceContract\.test\.ts/)
  assert.match(migration, /authorExplanation/)
  assert.match(migration, /authorComment/)
  assert.match(migration, /PRESENTATION ONLY/)
  assert.doesNotMatch(migration, /jsonb_build_object\([^\n]*(?:resourceCosts|effects|requirements|max)/)
})

test("reference UI renders the three authoring layers in canonical order", () => {
  const start = guide.indexOf('className="reference-feature-detail-content"')
  const end = guide.indexOf("</main>", start)
  const detail = guide.slice(start, end)

  const explanation = detail.indexOf("Восс объясняет")
  const rule = detail.indexOf("Точное правило")
  const comment = detail.indexOf("Комментарий Восса")
  assert.ok(explanation >= 0)
  assert.ok(rule > explanation)
  assert.ok(comment > rule)
})

test("canonical voice bans the modern office register", () => {
  assert.match(voice, /профсоюз/)
  assert.match(voice, /страхов/)
  assert.match(voice, /отдел кадров/)
  assert.match(voice, /Круг Луны/)
  assert.match(voice, /Жрецов Восс считает трус/i)
  assert.match(voice, /Воинов Восс любит/i)
})
