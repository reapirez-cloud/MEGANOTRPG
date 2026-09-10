import assert from "node:assert/strict"
import test from "node:test"

import { classReference } from "../src/data/classReference.ts"

const rogue = classReference.find((entry) => entry.id === "rogue")

function rogueFeature(name: string) {
  assert.ok(rogue, "rogue is absent from class reference")
  const feature = rogue.features?.find((candidate) => candidate.name === name)
  assert.ok(feature, `rogue feature is absent: ${name}`)
  return feature
}

test("Rogue literary reference is published without claiming runtime integration", () => {
  assert.ok(rogue, "rogue is absent from class reference")
  assert.equal(rogue.referenceOnly, true)
  assert.ok(rogue.explanation?.includes("Пешка заносит клинок"))
  assert.ok(rogue.voss?.includes("Дворяне платят тысячи золотых"))

  assert.equal(rogue.subclasses.length, 9)
  assert.ok(rogue.subclasses.every((subclass) => subclass.referenceOnly === true))
})

test("Rogue base reference covers the complete 2024 class-feature spine", () => {
  assert.ok(rogue, "rogue is absent from class reference")

  const expectedFeatures = [
    "Скрытая атака",
    "Компетентность",
    "Воровской жаргон",
    "Оружейное мастерство",
    "Хитрое действие",
    "Точный прицел",
    "Хитрый удар",
    "Невероятное уклонение",
    "Увёртливость",
    "Надёжный талант",
    "Улучшенный хитрый удар",
    "Коварные удары",
    "Скользкий ум",
    "Неуловимый",
    "Мастерский удар",
  ]

  assert.deepEqual(
    rogue.features?.map((feature) => feature.name),
    expectedFeatures,
  )

  for (const feature of rogue.features ?? []) {
    assert.ok(feature.mechanics.trim(), `${feature.level}/${feature.name} has no mechanics`)
  }
})

test("Rogue corrections do not regress to the supplied inaccurate rule blocks", () => {
  const expertise = rogueFeature("Компетентность")
  assert.match(expertise.mechanics, /воровские инструменты не являются допустимым выбором/i)

  const thievesCant = rogueFeature("Воровской жаргон")
  assert.doesNotMatch(thievesCant.mechanics, /СЛ\s*=|8\s*\+.*бонус мастерства/i)
  assert.match(thievesCant.mechanics, /не задаёт отдельную формулу СЛ/i)

  const cunningStrike = rogueFeature("Хитрый удар")
  assert.match(cunningStrike.mechanics, /Poisoner’s Kit/)
  assert.match(cunningStrike.mechanics, /8 \+ модификатор Ловкости \+ бонус мастерства/)

  const evasion = rogueFeature("Увёртливость")
  assert.match(evasion.mechanics, /Недееспособны/)

  const improved = rogueFeature("Улучшенный хитрый удар")
  assert.match(improved.mechanics, /до двух эффектов/)
  assert.doesNotMatch(improved.mechanics, /два различных эффекта/i)

  const devious = rogueFeature("Коварные удары")
  assert.match(devious.mechanics, /в конце каждого своего хода она повторяет спасбросок/i)
  assert.doesNotMatch(devious.mechanics, /другое существо действием/i)
  assert.doesNotMatch(devious.mechanics, /теряет возможность.*реакц/i)

  const stroke = rogueFeature("Мастерский удар")
  assert.match(stroke.mechanics, /D20 Test/)
  assert.match(stroke.mechanics, /спасброски/)
  assert.match(stroke.mechanics, /короткого или долгого отдыха/i)
})

test("missing Gemini prose is explicit instead of silently inventing Voss copy", () => {
  for (const name of ["Точный прицел", "Скользкий ум"]) {
    const feature = rogueFeature(name)
    assert.equal(feature.explanation, "")
    assert.equal(feature.voss, "")
    assert.match(feature.translationNote ?? "", /Перевода способности пока нет/)
  }
})
