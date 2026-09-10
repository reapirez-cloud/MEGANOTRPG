import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  classReference,
  SORCERER_RUNTIME_REFERENCE_SUBCLASS_IDS,
} from "../src/data/classReference.ts"

const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")

const expectedBaseFeatures = [
  "Врожденные чары и Сотворение заклинаний",
  "Источник магии и Метамагия",
  "Подкласс чародея",
  "Улучшение характеристик",
  "Чародейское восстановление",
  "Воплощение чародейства",
  "Эпический дар",
  "Магический апофеоз",
]

const authoredNarrativeBaseFeatures = new Set([
  "Врожденные чары и Сотворение заклинаний",
  "Источник магии и Метамагия",
  "Чародейское восстановление",
  "Воплощение чародейства",
  "Магический апофеоз",
])

const expectedFirstSubclassFeature: Record<string, string> = {
  "aberrant-sorcery": "Псионические заклинания и Телепатическая связь",
  "clockwork-sorcery": "Заклинания часового механизма и Восстановление баланса",
  "draconic-sorcery": "Драконья стойкость и Драконьи заклинания",
  "wild-magic-sorcery": "Дикий всплеск и Приливы хаоса",
  "divine-soul": "Божественная магия и Милость богов",
  "shadow-magic": "Глаза тьмы и Стойкость могилы",
  "storm-sorcery": "Вестник ветра и Бурная магия",
  "lunar-sorcery": "Воплощение луны и Лунный огонь",
  pyromancer: "Сердце огня",
}

test("Sorcerer keeps the authored Russian base ability presentation after runtime activation", () => {
  const sorcerer = classReference.find((entry) => entry.id === "sorcerer")
  assert.ok(sorcerer)
  assert.equal(sorcerer.referenceOnly, false)
  assert.deepEqual(sorcerer.features?.map((feature) => feature.name), expectedBaseFeatures)

  for (const feature of sorcerer.features || []) {
    assert.ok(feature.mechanics.trim(), `${feature.name} lost the exact Russian rule text`)
    assert.equal(feature.translationNote, undefined, `${feature.name} is still marked as untranslated`)
    if (authoredNarrativeBaseFeatures.has(feature.name)) {
      assert.ok(feature.explanation.trim(), `${feature.name} lost the authored explanation`)
      assert.ok(feature.voss?.trim(), `${feature.name} lost Voss commentary`)
    }
  }
})

test("all nine runtime Sorcerer subclasses keep their translated authored ability cards", () => {
  const sorcerer = classReference.find((entry) => entry.id === "sorcerer")
  assert.ok(sorcerer)

  assert.equal(SORCERER_RUNTIME_REFERENCE_SUBCLASS_IDS.length, 9)
  for (const id of SORCERER_RUNTIME_REFERENCE_SUBCLASS_IDS) {
    const subclass = sorcerer.subclasses.find((entry) => entry.id === id)
    assert.ok(subclass, `missing Sorcerer subclass ${id}`)
    assert.equal(subclass.referenceOnly, false)
    assert.equal(subclass.features?.[0]?.name, expectedFirstSubclassFeature[id])

    for (const feature of subclass.features || []) {
      assert.ok(feature.explanation.trim(), `${id}/${feature.name} lost the authored explanation`)
      assert.ok(feature.mechanics.trim(), `${id}/${feature.name} lost the exact Russian rule text`)
      assert.ok(feature.voss?.trim(), `${id}/${feature.name} lost Voss commentary`)
      assert.equal(feature.translationNote, undefined, `${id}/${feature.name} is still marked as untranslated`)
    }
  }
})

test("Reference Guide overlays Sorcerer authored presentation on the live runtime instead of replacing it", () => {
  assert.match(guide, /function mergeSorcererAuthoredFeatures/)
  assert.match(guide, /selectedClass\?\.id === "sorcerer"[^\n]*mergeSorcererAuthoredFeatures/)
  assert.match(guide, /selectedClass\?\.id === "sorcerer"[\s\S]{0,180}mergeSorcererAuthoredFeatures\(authored, features/)
  assert.match(guide, /isSorcerer \? old\?\.name \|\| template\.name/)
  assert.match(guide, /isSorcerer \? old\?\.voss \|\| template\.author_comment/)
})
