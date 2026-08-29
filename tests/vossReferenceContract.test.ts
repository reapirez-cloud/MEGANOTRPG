import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/migrations/20260829162500_voss_reference_voice_contract.sql", "utf8")
const abilityMigration = fs.readFileSync("supabase/migrations/20260829151113_voss_spell_style_ability_explanations.sql", "utf8")
const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const druid = fs.readFileSync("src/data/classes/druidReference.ts", "utf8")
const voice = fs.readFileSync("src/data/vossVoice.ts", "utf8")

test("Voss explanation is authored voice, not a mechanical-summary rewrite", () => {
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

test("audited feature cards carry authored explanations before renderer fallback can be used", () => {
  assert.match(abilityMigration, /authorExplanation/)
  assert.match(abilityMigration, /Есть обычные молитвы/)
  assert.match(abilityMigration, /Когда человеческое тело перестаёт подходить задаче/)
  assert.match(abilityMigration, /Получили по рёбрам, отдышались и решили, что умирать сегодня неудобно/)
  assert.match(abilityMigration, /Когда одного действия не хватило, воин просто делает ещё одно прямо сейчас/)
  assert.match(guide, /return explicitFeatureExplanation\(mechanics\) \|\| fallbackFeatureExplanation\(mechanics, description\)/)
})

test("static Druid reference uses Voss voice rather than rule paraphrase", () => {
  assert.match(druid, /После отдыха друид решает, какую часть природы сегодня держать наготове/)
  assert.match(druid, /Не хочется самому лезть в тёмную дыру/)
  assert.match(druid, /Медведь, который рычит/)
  assert.match(druid, /Друидам я не доверяю/)
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
