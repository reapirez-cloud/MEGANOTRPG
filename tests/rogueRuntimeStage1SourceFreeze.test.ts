import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { classReference } from "../src/data/classReference.ts"

const rogue = classReference.find((entry) => entry.id === "rogue")
const matrix = readFileSync(new URL("../src/data/classes/rogueRuntimeFeatureMatrix.md", import.meta.url), "utf8")
const plan = readFileSync(new URL("../src/data/classes/rogueRuntimePlan.md", import.meta.url), "utf8")
const ledger = readFileSync(new URL("../src/rule-templates/CLASS_WORK_STATUS.md", import.meta.url), "utf8")
const queue = readFileSync(new URL("../docs/WORK_QUEUE.md", import.meta.url), "utf8")

function baseFeature(name: string) {
  assert.ok(rogue, "rogue is absent from public class reference")
  const value = rogue.features?.find((feature) => feature.name === name)
  assert.ok(value, "missing Rogue feature: " + name)
  return value
}

function subclass(id: string) {
  assert.ok(rogue, "rogue is absent from public class reference")
  const value = rogue.subclasses.find((candidate) => candidate.id === id)
  assert.ok(value, "missing Rogue subclass: " + id)
  return value
}

function subclassFeature(subclassId: string, name: string) {
  const value = subclass(subclassId)
  const feature = value.features?.find((candidate) => candidate.name === name)
  assert.ok(feature, "missing " + subclassId + " feature: " + name)
  return feature
}

test("Rogue Stage 1 freezes the complete supported literary/reference roster without activating runtime", () => {
  assert.ok(rogue, "rogue is absent from public class reference")
  assert.equal(rogue.referenceOnly, true)
  assert.equal(rogue.features?.length, 15)
  assert.equal(rogue.subclasses.length, 9)
  assert.ok(rogue.subclasses.every((value) => value.referenceOnly === true))

  const expectedCounts = new Map<string, number>([
    ["thief", 5],
    ["assassin", 5],
    ["arcane-trickster", 5],
    ["soulknife", 5],
    ["swashbuckler", 5],
    ["inquisitive", 6],
    ["mastermind", 5],
    ["scout", 5],
    ["phantom", 5],
  ])

  let subclassFeatureCount = 0
  for (const [id, expectedCount] of expectedCounts) {
    const value = subclass(id)
    assert.equal(value.features?.length, expectedCount, id + " feature count drifted")
    subclassFeatureCount += value.features?.length ?? 0
    for (const feature of value.features ?? []) {
      assert.ok(feature.explanation.trim(), id + "/" + feature.name + " lacks literary explanation")
      assert.ok(feature.voss?.trim(), id + "/" + feature.name + " lacks Voss comment")
      assert.ok(feature.mechanics.trim(), id + "/" + feature.name + " lacks exact mechanics")
    }
  }

  assert.equal(subclassFeatureCount, 46)
  assert.equal((rogue.features?.length ?? 0) + subclassFeatureCount, 61)
})

test("Rogue Stage 1 closes every explicit literary gap", () => {
  for (const name of ["Точный прицел", "Скользкий ум"]) {
    const feature = baseFeature(name)
    assert.ok(feature.explanation.trim())
    assert.ok(feature.voss?.trim())
    assert.equal(feature.translationNote, undefined)
  }

  const allText = [
    readFileSync(new URL("../src/data/classes/rogueReferenceCurrent.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../src/data/classes/rogueSubclassReferenceWave1.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../src/data/classes/rogueSubclassReferenceWave2.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../src/data/classes/rogueSubclassReferenceWave3.ts", import.meta.url), "utf8"),
  ].join("\n")

  assert.doesNotMatch(allText, /TRANSLATION_MISSING|Перевода способности пока нет/)
})

test("Rogue Stage 1 source freeze locks the 2024 base rules most likely to regress", () => {
  const steadyAim = baseFeature("Точный прицел")
  assert.match(steadyAim.mechanics, /ещё не перемещались/i)
  assert.match(steadyAim.mechanics, /Скорость становится 0/i)
  const slipperyMind = baseFeature("Скользкий ум")
  assert.match(slipperyMind.mechanics, /Мудрости и Харизмы/i)
  const stroke = baseFeature("Мастерский удар")
  assert.match(stroke.mechanics, /D20 Test/i)
  assert.match(stroke.mechanics, /короткого или долгого отдыха/i)
  const expertise = baseFeature("Компетентность")
  assert.match(expertise.mechanics, /воровские инструменты не являются допустимым выбором/i)
})

test("Rogue Stage 1 source freeze preserves 2024 Arcane Trickster and Soulknife deltas", () => {
  const spellThief = subclassFeature("arcane-trickster", "Воровство заклинаний")
  assert.match(spellThief.mechanics, /спасбросок Интеллекта/i)
  assert.match(spellThief.mechanics, /не обязано быть Wizard spell/i)
  assert.match(spellThief.mechanics, /действительно украли заклинание/i)
  const spellcasting = subclassFeature("arcane-trickster", "Использование заклинаний")
  assert.match(spellcasting.mechanics, /Ограничений по школам Иллюзии и Очарования.*нет/i)
  const psionics = subclassFeature("soulknife", "Псионическая сила")
  assert.match(psionics.mechanics, /4d6 на 3 уровне; 6d8 на 5; 8d8 на 9; 8d10 на 11; 10d10 на 13; 12d12 на 17/i)
  assert.match(psionics.mechanics, /Short Rest.*одну.*Long Rest.*все/i)
  const blades = subclassFeature("soulknife", "Психические клинки")
  assert.match(blades.mechanics, /Opportunity Attack/i)
  assert.match(blades.mechanics, /Thrown 60\/120/i)
  assert.match(blades.mechanics, /Mastery Vex/i)
})

test("Rogue Stage 1 matrix assigns all 61 features stable keys and runtime ownership", () => {
  const rowKeys = [...matrix.matchAll(/^\| `(rogue:[^`]+)` \|/gm)].map((match) => match[1])
  assert.equal(rowKeys.length, 61)
  assert.equal(new Set(rowKeys).size, 61)
  for (const id of [
    "subclass:rogue:thief", "subclass:rogue:assassin", "subclass:rogue:arcane-trickster",
    "subclass:rogue:soulknife", "subclass:rogue:swashbuckler", "subclass:rogue:inquisitive",
    "subclass:rogue:mastermind", "subclass:rogue:scout", "subclass:rogue:phantom",
  ]) {
    assert.ok(matrix.includes("`" + id + "`"), "matrix lacks stable catalog identity " + id)
  }
  assert.match(matrix, /Missing generic primitives discovered by Stage 1/)
  assert.match(matrix, /no automatic Larisa-time expiry/i)
  assert.match(matrix, /fallback token is after Long Rest rather than Initiative/i)
})

test("Rogue Stage 1 is the closed checkpoint and Stage 2 is the canonical next step", () => {
  assert.match(plan, /Stage 1 — source freeze, literary closure and executable specification[\s\S]*?Status:\*\*\s*`COMPLETE_2026_09_12`/)
  assert.match(plan, /Stage 2 — clean class foundation and 1–20 progression[\s\S]*?Status:\*\*\s*`NOT_STARTED`/)
  assert.match(ledger, /stage_1_source_freeze_and_text_closure: COMPLETE_2026_09_12/)
  assert.match(ledger, /stage_2_foundation_1_20: NOT_STARTED/)
  assert.match(queue, /Next Rogue stage: \*\*Stage 2 — clean class foundation and 1–20 progression\*\*/)
})
