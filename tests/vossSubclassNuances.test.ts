import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/migrations/20260829142821_subclass_voss_nuances.sql", "utf8")
const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const voice = fs.readFileSync("src/data/vossVoice.ts", "utf8")
const types = fs.readFileSync("src/types/characterMechanics.ts", "utf8")

test("subclass nuance migration is presentation-only and covers audited subclasses", () => {
  assert.match(migration, /PRESENTATION ONLY/)
  assert.match(migration, /authorNuances/)
  assert.match(migration, /subclass:fighter/)
  assert.match(migration, /subclass:druid/)
  assert.match(migration, /subclass:cleric/)
  assert.match(migration, /Но ветер же ветер/)
  assert.doesNotMatch(migration, /jsonb_set\([^\n]*\{payload,description\}/)
  assert.doesNotMatch(migration, /jsonb_build_object\([^\n]*(?:resourceCosts|effects|requirements|max)/)
})

test("subclass ability detail renders explanation rule nuances and comment in order", () => {
  const start = guide.indexOf('className="reference-feature-detail-content"')
  const end = guide.indexOf("</main>", start)
  const detail = guide.slice(start, end)

  const explanation = detail.indexOf("Восс объясняет")
  const rule = detail.indexOf("Точное правило")
  const nuances = detail.indexOf("Нюансы Восса")
  const comment = detail.indexOf("Комментарий Восса")

  assert.ok(explanation >= 0)
  assert.ok(rule > explanation)
  assert.ok(nuances > rule)
  assert.ok(comment > nuances)
})

test("collapsed ability card visibly identifies the Voss explanation layer", () => {
  assert.match(guide, /reference-class-feature__eyebrow/)
  assert.match(guide, />Восс объясняет</)
  assert.match(guide, /Объяснение → правило → нюансы → комментарий/)
})

test("nuances are renderer-only structured presentation data", () => {
  assert.match(types, /authorNuances\?: string\[\]/)
  assert.match(voice, /Нюансы Восса/)
  assert.match(voice, /типичн.{0,30}(ошиб|трактов)/i)
  assert.match(voice, /не (?:создают|добавляют|придумывают).{0,30}(нов|скрыт).{0,30}(механ|прав)/i)
})
