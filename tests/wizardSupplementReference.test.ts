import assert from "node:assert/strict"
import test from "node:test"

import { wizardLegacySchoolReferenceSubclasses } from "../src/data/classes/wizardLegacySchoolsReference.ts"
import { wizardTashaReferenceSubclasses } from "../src/data/classes/wizardTashaReference.ts"
import { wizardWildemountReferenceSubclasses } from "../src/data/classes/wizardWildemountReference.ts"
import { wizardXanatharReferenceSubclasses } from "../src/data/classes/wizardXanatharReference.ts"
import {
  vossExplanationHasBoilerplate,
  vossExplanationHasRulesMeta,
  vossTextHasAbusiveRegister,
  vossTextHasModernRegister,
} from "../src/data/vossVoice.ts"

const translated = [
  ...wizardTashaReferenceSubclasses,
  ...wizardLegacySchoolReferenceSubclasses,
  ...wizardXanatharReferenceSubclasses,
  ...wizardWildemountReferenceSubclasses,
]

test("every translated Wizard supplement feature keeps Voss prose separate from exact rules", () => {
  assert.equal(translated.length, 9)

  for (const subclass of translated) {
    assert.ok(subclass.summary.trim(), `${subclass.id}: summary is missing`)
    assert.ok(subclass.mechanics?.trim(), `${subclass.id}: mechanics summary is missing`)
    assert.ok(subclass.voss?.trim(), `${subclass.id}: Voss comment is missing`)
    assert.equal(vossTextHasModernRegister(subclass.voss || ""), false, `${subclass.id}: modern register leaked into subclass comment`)
    assert.equal(vossTextHasAbusiveRegister(subclass.voss || ""), false, `${subclass.id}: abusive register leaked into subclass comment`)

    for (const feature of subclass.features || []) {
      const label = `${subclass.id}:${feature.level}:${feature.name}`
      assert.ok(feature.explanation.trim().length >= 80, `${label}: Voss explanation is too thin`)
      assert.ok(feature.mechanics.trim(), `${label}: exact rules are missing`)
      assert.equal(vossExplanationHasRulesMeta(feature.explanation), false, `${label}: mechanics leaked into Voss explanation`)
      assert.equal(vossExplanationHasBoilerplate(feature.explanation), false, `${label}: renderer boilerplate leaked into Voss explanation`)
      assert.equal(vossTextHasModernRegister(feature.explanation), false, `${label}: modern register leaked into Voss explanation`)
      assert.equal(vossTextHasAbusiveRegister(feature.explanation), false, `${label}: abusive register leaked into Voss explanation`)
      assert.equal(vossTextHasModernRegister(feature.voss || ""), false, `${label}: modern register leaked into Voss comment`)
      assert.equal(vossTextHasAbusiveRegister(feature.voss || ""), false, `${label}: abusive register leaked into Voss comment`)
    }
  }
})

test("legacy rules retain easy-to-drop restrictions from the published subclasses", () => {
  const necromancer = wizardLegacySchoolReferenceSubclasses.find((entry) => entry.id === "necromancy")
  const commandUndead = necromancer?.features?.find((feature) => feature.name === "Повелевание нежитью")
  assert.match(commandUndead?.mechanics || "", /успешно проходит.*больше не можете использовать/iu)

  const transmuter = wizardLegacySchoolReferenceSubclasses.find((entry) => entry.id === "transmutation")
  const masterTransmuter = transmuter?.features?.find((feature) => feature.name === "Мастер преобразования")
  assert.match(masterTransmuter?.mechanics || "", /не можете создать новый до завершения долгого отдыха/iu)

  const warMage = wizardXanatharReferenceSubclasses.find((entry) => entry.id === "war-magic")
  const powerSurge = warMage?.features?.find((feature) => feature.name === "Скачок силы")
  assert.match(powerSurge?.mechanics || "", /После долгого отдыха число накопленных скачков становится равным 1/iu)

  const graviturge = wizardWildemountReferenceSubclasses.find((entry) => entry.id === "graviturgy")
  const eventHorizon = graviturge?.features?.find((feature) => feature.name === "Горизонт событий")
  assert.match(eventHorizon?.mechanics || "", /2d10 силового урона/iu)

  const chronurgist = wizardWildemountReferenceSubclasses.find((entry) => entry.id === "chronurgy")
  const convergentFuture = chronurgist?.features?.find((feature) => feature.name === "Сходящееся будущее")
  assert.match(convergentFuture?.mechanics || "", /Истощение.*только завершением долгого отдыха/iu)
})
