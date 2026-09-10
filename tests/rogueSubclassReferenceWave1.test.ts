import assert from "node:assert/strict"
import test from "node:test"

import { classReference } from "../src/data/classReference.ts"

const rogue = classReference.find((entry) => entry.id === "rogue")

function subclass(id: string) {
  assert.ok(rogue, "rogue is absent from class reference")
  const value = rogue.subclasses.find((candidate) => candidate.id === id)
  assert.ok(value, `rogue subclass is absent: ${id}`)
  return value
}

function subclassFeature(subclassId: string, name: string) {
  const value = subclass(subclassId)
  const feature = value.features?.find((candidate) => candidate.name === name)
  assert.ok(feature, `${subclassId} feature is absent: ${name}`)
  return feature
}

test("Rogue wave 1 publishes three complete literary subclasses without claiming runtime", () => {
  for (const [id, expectedCount] of [
    ["thief", 5],
    ["assassin", 5],
    ["arcane-trickster", 5],
  ] as const) {
    const value = subclass(id)
    assert.equal(value.referenceOnly, true)
    assert.equal(value.features?.length, expectedCount)
    assert.ok(value.explanation?.trim())
    assert.ok(value.voss?.trim())
    assert.ok(value.features?.every((feature) => feature.mechanics.trim()))
  }
})

test("Thief uses the 2024 Fast Hands, Supreme Sneak and Use Magic Device contracts", () => {
  const fastHands = subclassFeature("thief", "Быстрые руки")
  assert.match(fastHands.mechanics, /Magic action/i)
  assert.match(fastHands.mechanics, /Utilize/i)
  assert.doesNotMatch(fastHands.mechanics, /любым немагическим предметом/i)

  const supremeSneak = subclassFeature("thief", "Скрытность в движении")
  assert.match(supremeSneak.mechanics, /Three-Quarters Cover/i)
  assert.match(supremeSneak.mechanics, /Total Cover/i)
  assert.match(supremeSneak.mechanics, /Half Cover недостаточно/i)

  const magicDevice = subclassFeature("thief", "Использование магических предметов")
  assert.match(magicDevice.mechanics, /четыре магических предмета/i)
  assert.match(magicDevice.mechanics, /Spell Scroll/i)
  assert.match(magicDevice.mechanics, /СЛ 10 \+ уровень заклинания/i)
  assert.match(magicDevice.mechanics, /не содержит старого общего правила/i)

  const reflexes = subclassFeature("thief", "Воровские рефлексы")
  assert.match(reflexes.mechanics, /Initiative минус 10/i)
  assert.match(reflexes.mechanics, /отдельного запрета.*Surprised нет/i)
})

test("Assassin keeps current 2024 infiltration and poison behavior", () => {
  const tools = subclassFeature("assassin", "Инструменты убийцы")
  assert.match(tools.mechanics, /Disguise Kit/)
  assert.match(tools.mechanics, /Poisoner’s Kit/)
  assert.match(tools.mechanics, /не даёт дополнительной замены/i)

  const infiltration = subclassFeature("assassin", "Искусство проникновения")
  assert.match(infiltration.mechanics, /1 часа/i)
  assert.match(infiltration.mechanics, /Roving Aim/i)
  assert.match(infiltration.mechanics, /Steady Aim больше не уменьшает.*Speed до 0/i)
  assert.match(infiltration.mechanics, /не даёт отдельного Преимущества на проверки Обмана/i)

  const envenom = subclassFeature("assassin", "Отравленное оружие")
  assert.match(envenom.mechanics, /2d6.*каждый раз.*проваливает спасбросок/i)
  assert.match(envenom.mechanics, /игнорирует Resistance/i)
  assert.match(envenom.mechanics, /не создаёт отдельный автоматический урон в начале хода/i)
  assert.match(envenom.mechanics, /не игнорирует Immunity/i)

  const deathStrike = subclassFeature("assassin", "Смертельный удар")
  assert.match(deathStrike.mechanics, /первом раунде боя/i)
  assert.match(deathStrike.mechanics, /8 \+ ваш модификатор Ловкости \+ бонус мастерства/i)
  assert.match(deathStrike.mechanics, /весь урон этой атаки.*удваивается/i)
})

test("Arcane Trickster uses the 2024 spell and Mage Hand subclass revisions", () => {
  const spellcasting = subclassFeature("arcane-trickster", "Использование заклинаний")
  assert.match(spellcasting.mechanics, /Mage Hand и два других Wizard cantrip/i)
  assert.match(spellcasting.mechanics, /3\/4\/4\/4\/5\/6\/6\/7\/8\/8\/9\/10\/10\/11\/11\/11\/12\/13/)
  assert.match(spellcasting.mechanics, /Arcane Focus/i)
  assert.match(spellcasting.mechanics, /Ограничений по школам Иллюзии и Очарования.*нет/i)

  const legerdemain = subclassFeature("arcane-trickster", "Ловкость рук мага")
  assert.match(legerdemain.mechanics, /сотворить его Бонусным действием/i)
  assert.match(legerdemain.mechanics, /Ловкость рук/i)
  assert.match(legerdemain.mechanics, /больше не содержит отдельного списка из 2014/i)

  const versatile = subclassFeature("arcane-trickster", "Универсальный ловкач")
  assert.match(versatile.mechanics, /Trip.*Cunning Strike/i)
  assert.match(versatile.mechanics, /другому существу в пределах 5 футов/i)
  assert.match(versatile.mechanics, /не выдаёт вам Преимущество на атаки/i)

  const spellThief = subclassFeature("arcane-trickster", "Воровство заклинаний")
  assert.match(spellThief.mechanics, /спасбросок Интеллекта/i)
  assert.match(spellThief.mechanics, /уровень 1\+/i)
  assert.match(spellThief.mechanics, /8 часов/i)
  assert.match(spellThief.mechanics, /после того как вы действительно украли заклинание/i)
  assert.match(spellThief.mechanics, /спасбросок всегда Intelligence/i)
})
