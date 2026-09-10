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

test("Rogue wave 2 publishes three complete literary subclasses without claiming runtime", () => {
  for (const [id, expectedCount] of [
    ["soulknife", 5],
    ["swashbuckler", 5],
    ["inquisitive", 6],
  ] as const) {
    const value = subclass(id)
    assert.equal(value.referenceOnly, true)
    assert.equal(value.features?.length, expectedCount)
    assert.ok(value.explanation?.trim())
    assert.ok(value.voss?.trim())
    assert.ok(value.features?.every((feature) => feature.mechanics.trim()))
  }
})

test("Soulknife uses the Player's Handbook 2024 psionic contract", () => {
  const psionics = subclassFeature("soulknife", "Псионическая сила")
  assert.match(psionics.mechanics, /4d6.*6d8.*8d8.*8d10.*10d10.*12d12/i)
  assert.match(psionics.mechanics, /Short Rest вы восстанавливаете одну потраченную кость/i)
  assert.doesNotMatch(psionics.mechanics, /Бонусным действием.*восстановить одну/i)
  assert.match(psionics.mechanics, /Magic action/i)
  assert.match(psionics.mechanics, /1 мили/i)

  const blades = subclassFeature("soulknife", "Психические клинки")
  assert.match(blades.mechanics, /Opportunity Attack/i)
  assert.match(blades.mechanics, /Thrown 60\/120/i)
  assert.match(blades.mechanics, /Mastery Vex/i)
  assert.match(blades.mechanics, /1d4 вместо 1d6/i)

  const soulBlades = subclassFeature("soulknife", "Заряды пси-клинков")
  assert.match(soulBlades.mechanics, /Если это превращает промах в попадание, кость расходуется/i)
  assert.match(soulBlades.mechanics, /сразу израсходуйте одну Psionic Energy Die/i)

  const veil = subclassFeature("soulknife", "Психическая завеса")
  assert.match(veil.mechanics, /Magic action/i)
  assert.match(veil.mechanics, /одну Psionic Energy Die без действия/i)

  const rend = subclassFeature("soulknife", "Разрыв разума")
  assert.match(rend.mechanics, /Sneak Attack.*Psychic Blades/i)
  assert.match(rend.mechanics, /8 \+ модификатор Ловкости \+ бонус мастерства/i)
  assert.match(rend.mechanics, /три Psionic Energy Dice без действия/i)
})

test("Swashbuckler stays an exact Xanathar legacy reference instead of inventing a 2024 rewrite", () => {
  const value = subclass("swashbuckler")
  assert.match(value.summary, /legacy-правила Xanathar/i)
  assert.match(value.summary, /отдельной официальной PHB 2024 версии.*нет/i)

  const footwork = subclassFeature("swashbuckler", "Причудливая дерзость")
  assert.match(footwork.mechanics, /melee attack/i)
  assert.match(footwork.mechanics, /Попадание не требуется/i)

  const audacity = subclassFeature("swashbuckler", "Дерзкая отвага")
  assert.match(audacity.mechanics, /модификатор Харизмы.*Initiative/i)
  assert.match(audacity.mechanics, /никакие другие существа не находятся в пределах 5 футов от вас/i)
  assert.match(audacity.mechanics, /не создаёт Advantage/i)

  const panache = subclassFeature("swashbuckler", "Панегирик / Насмешка")
  assert.match(panache.mechanics, /Persuasion.*Insight/i)
  assert.match(panache.mechanics, /воздействует на неё заклинанием/i)
  assert.match(panache.mechanics, /Charmed/i)

  const maneuver = subclassFeature("swashbuckler", "Элегантный маневр")
  assert.match(maneuver.mechanics, /Acrobatics.*Athletics/i)
  assert.match(maneuver.mechanics, /текущего хода/i)

  const duelist = subclassFeature("swashbuckler", "Мастерский выпад")
  assert.match(duelist.mechanics, /перебросить эту атаку с Advantage/i)
  assert.match(duelist.mechanics, /Short Rest или Long Rest/i)
})

test("Inquisitive keeps exact Xanathar limits and does not overstate Unerring Eye", () => {
  const value = subclass("inquisitive")
  assert.match(value.summary, /legacy-правила Xanathar/i)
  assert.match(value.summary, /отдельной официальной PHB 2024 версии.*нет/i)

  const deceit = subclassFeature("inquisitive", "Ухо обманщика")
  assert.match(deceit.mechanics, /7 или ниже.*считается результатом 8/i)
  assert.match(deceit.mechanics, /не применяется к Insightful Fighting/i)

  const detail = subclassFeature("inquisitive", "Око проницательности")
  assert.match(detail.mechanics, /Bonus Action/i)
  assert.match(detail.mechanics, /Perception/i)
  assert.match(detail.mechanics, /Investigation/i)

  const fighting = subclassFeature("inquisitive", "Проницательный бой")
  assert.match(fighting.mechanics, /Insight.*Deception/i)
  assert.match(fighting.mechanics, /1 минуту/i)
  assert.match(fighting.mechanics, /не создаёт Advantage|без Advantage/i)

  const steady = subclassFeature("inquisitive", "Непогрешимый взгляд")
  assert.match(steady.mechanics, /не более чем на половину своей Speed/i)

  const unerring = subclassFeature("inquisitive", "Безошибочный глаз")
  assert.match(unerring.mechanics, /30 футов/i)
  assert.match(unerring.mechanics, /не сообщает.*где именно находится источник обмана/i)
  assert.match(unerring.mechanics, /не раскрывает.*истинную форму|истинная природа/i)
  assert.match(unerring.mechanics, /модификатору Мудрости, минимум 1/i)
  assert.doesNotMatch(unerring.mechanics, /безошибочно узна[её]т местоположение/i)

  const weakness = subclassFeature("inquisitive", "Эксплуатация слабости")
  assert.match(weakness.mechanics, /Insightful Fighting/i)
  assert.match(weakness.mechanics, /3d6/i)
})
