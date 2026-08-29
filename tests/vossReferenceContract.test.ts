import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/migrations/20260829162500_voss_reference_voice_contract.sql", "utf8")
const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const voice = fs.readFileSync("src/data/vossVoice.ts", "utf8")

test("Voss explanation is authored voice, never a generated mechanical paraphrase", () => {
  assert.match(migration, /Восс объясняет.*authored narrator layer/i)
  assert.match(migration, /Exact mechanics belong in mechanical_summary\/description/i)
  assert.match(migration, /authorExplanation values authored by 20260829151113 are intentionally preserved/i)

  assert.doesNotMatch(migration, /voss_plain_explanation/i)
  assert.doesNotMatch(migration, /Это запас применений/)
  assert.doesNotMatch(migration, /Это отдельное действие/)
  assert.doesNotMatch(migration, /Это постоянное владение/)

  assert.match(migration, /Воин — редкий случай/)
  assert.match(migration, /Друид смотрит на человеческое тело/)
  assert.match(migration, /Жрец договаривается с небесами/)
  assert.match(migration, /Я потому и не глажу незнакомых медведей/)
})

test("all three audited class families receive explicit Voss-authored descriptions", () => {
  assert.match(migration, /when 'class:fighter'/)
  assert.match(migration, /when 'class:druid'/)
  assert.match(migration, /when 'class:cleric'/)
  assert.match(migration, /when 'subclass:fighter:/)
  assert.match(migration, /when 'subclass:druid:/)
  assert.match(migration, /when 'subclass:cleric:/)
})

test("renderer never fabricates dry prose under the Voss label", () => {
  assert.doesNotMatch(guide, /fallbackFeatureExplanation/)
  assert.doesNotMatch(guide, /Это запас применений/)
  assert.doesNotMatch(guide, /Это отдельное действие/)
  assert.doesNotMatch(guide, /Это постоянные владения/)
  assert.match(guide, /explanation: explicitFeatureExplanation\(mechanics\)/)
  assert.match(guide, /selectedFeature\.explanation && <section className="reference-voss-explanation surface">/)
})

test("Druid uses the live campaign catalog first and keeps static copy only as fallback", () => {
  assert.match(guide, /classExplanation = classTemplate\?\.author_description\?\.trim\(\) \|\| \(isDruid \? druidReference\.authorDescription : ""\)/)
  assert.match(guide, /classComment = classTemplate\?\.author_comment\?\.trim\(\) \|\| \(isDruid \? druidReference\.authorComment : ""\)/)
  assert.match(guide, /displayedClassFeatures = classFeatures\.length \? classFeatures : \(isDruid \? staticDruidFeatures\(\) : \[\]\)/)
  assert.doesNotMatch(guide, /isDruid \? druidReference\.features\.map/)
})

test("reference UI renders explanation -> exact rule -> comment in canonical order", () => {
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

test("canonical voice stays recognizably Voss rather than office prose", () => {
  assert.match(voice, /профсоюз/)
  assert.match(voice, /страхов/)
  assert.match(voice, /отдел кадров/)
  assert.match(voice, /Круг Луны/)
  assert.match(voice, /Жрецов Восс считает трус/i)
  assert.match(voice, /Воинов Восс любит/i)
})
