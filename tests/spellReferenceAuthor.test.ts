import assert from "node:assert/strict"
import test from "node:test"

import { spellAuthorAttitudes, spellAuthorVoiceRules, spellReferenceAuthor } from "../src/data/spellReferenceAuthor.ts"
import { spellClassOptions } from "../src/lib/spellCatalog.ts"

test("spellbook author has one stable attitude for every supported base class", () => {
  const expected = new Set(spellClassOptions.map((item) => item.value))
  const actual = new Set(spellAuthorAttitudes.map((item) => item.classKey))

  assert.equal(actual.size, expected.size)
  for (const classKey of expected) assert.ok(actual.has(classKey), `Missing author attitude for ${classKey}`)
})

test("Reynar Voss voice keeps mechanics separate from sarcasm", () => {
  assert.equal(spellReferenceAuthor.name, "Рейнар Восс")
  assert.ok(spellAuthorVoiceRules.some((rule) => rule.includes("Механика всегда отделена")))
  assert.ok(spellAuthorVoiceRules.some((rule) => rule.includes("условия")))
})

test("author relationships keep the agreed class bias", () => {
  const byClass = new Map(spellAuthorAttitudes.map((item) => [item.classKey, item]))

  assert.equal(byClass.get("ranger")?.respect, "любит")
  assert.equal(byClass.get("fighter")?.respect, "любит")
  assert.equal(byClass.get("cleric")?.respect, "презирает")
  assert.equal(byClass.get("rogue")?.respect, "презирает")
  assert.match(byClass.get("druid")?.summary || "", /Кругу Луны/)
})
