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

test("Rogue wave 3 publishes Mastermind Scout and Phantom literary feature packs without claiming runtime", () => {
  for (const [id, expectedCount] of [
    ["mastermind", 5],
    ["scout", 5],
    ["phantom", 5],
  ] as const) {
    const value = subclass(id)
    assert.equal(value.referenceOnly, true)
    assert.equal(value.features?.length, expectedCount)
    assert.ok(value.features?.every((feature) => feature.explanation.trim()))
    assert.ok(value.features?.every((feature) => feature.voss?.trim()))
    assert.ok(value.features?.every((feature) => feature.mechanics.trim()))
  }
})

test("Mastermind keeps exact legacy limits instead of invented contests", () => {
  const intrigue = subclassFeature("mastermind", "Мастер интриг")
  assert.match(intrigue.mechanics, /Набором для грима/i)
  assert.match(intrigue.mechanics, /Набором для подделки документов/i)
  assert.match(intrigue.mechanics, /два языка/i)
  assert.match(intrigue.mechanics, /не менее 1 минуты/i)
  assert.match(intrigue.mechanics, /знаете язык/i)
  assert.doesNotMatch(intrigue.mechanics, /Insight.*Deception|Проницательность.*Обман/i)

  const manipulator = subclassFeature("mastermind", "Проницательный манипулятор")
  assert.match(manipulator.mechanics, /Intelligence.*Wisdom.*Charisma.*уровни классов/i)
  assert.match(manipulator.mechanics, /по усмотрению GM/i)

  const deceit = subclassFeature("mastermind", "Душа обмана")
  assert.match(deceit.mechanics, /Deception.*Insight/i)
  assert.match(deceit.mechanics, /по вашему выбору/i)
  assert.doesNotMatch(deceit.mechanics, /всегда показывают.*правду/i)
})

test("Scout preserves Xanathar Ambush Master and Sudden Strike target semantics", () => {
  const ambush = subclassFeature("scout", "Мастер засад")
  assert.match(ambush.mechanics, /Initiative.*Advantage/i)
  assert.match(ambush.mechanics, /первое существо.*первом раунде/i)
  assert.match(ambush.mechanics, /до начала вашего следующего хода/i)

  const strike = subclassFeature("scout", "Внезапный удар")
  assert.match(strike.mechanics, /действие Attack/i)
  assert.match(strike.mechanics, /бонусным действием/i)
  assert.match(strike.mechanics, /Sneak Attack нельзя применить к одной(?: и той же)? цели более одного раза/i)
  assert.match(strike.mechanics, /сама дополнительная атака не обязана выбирать другую цель/i)
  assert.doesNotMatch(strike.mechanics, /работает только.*обе атаки.*разным существам/i)
})

test("Phantom uses Tasha legacy soul-token rules and not revised initiative semantics", () => {
  const whispers = subclassFeature("phantom", "Шепот мертвецов")
  assert.match(whispers.mechanics, /Short Rest или Long Rest/i)
  assert.match(whispers.mechanics, /пока.*не.*выбрать другое/i)

  const wails = subclassFeature("phantom", "Вопли из могилы")
  assert.match(wails.mechanics, /Бросьте количество костей/i)
  assert.match(wails.mechanics, /половине числа ваших Sneak Attack dice/i)
  assert.match(wails.mechanics, /Necrotic/i)
  assert.match(wails.mechanics, /Proficiency Bonus/i)

  const tokens = subclassFeature("phantom", "Осколки усопших")
  assert.match(tokens.mechanics, /свободную руку/i)
  assert.match(tokens.mechanics, /не обязан говорить правду/i)
  assert.doesNotMatch(tokens.mechanics, /за исключением Нежити|за исключением.*Конструкт/i)

  const ghostWalk = subclassFeature("phantom", "Призрачная походка")
  assert.match(ghostWalk.mechanics, /Fly Speed 10 футов/i)
  assert.match(ghostWalk.mechanics, /Disadvantage/i)
  assert.match(ghostWalk.mechanics, /1d10 Force damage/i)
  assert.match(ghostWalk.mechanics, /Soul Trinket/i)

  const friend = subclassFeature("phantom", "Друг смерти")
  assert.match(friend.mechanics, /в конце Long Rest/i)
  assert.match(friend.mechanics, /если.*нет ни одного/i)
  assert.doesNotMatch(friend.mechanics, /при броске Initiative.*появляется/i)
})
