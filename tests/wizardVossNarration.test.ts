import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { classReference } from "../src/data/classReference.ts"
import {
  getWizardBaseVossComment,
  getWizardBaseVossNarration,
  wizardClassVossComment,
  wizardClassVossNarration,
  wizardVossNarrationCoverage,
} from "../src/data/classes/wizardVossNarration.ts"
import {
  getWizardSubclassVossComment,
  getWizardSubclassVossNarration,
  wizardSubclassVossNarrationCoverage,
} from "../src/data/classes/wizardSubclassVossNarration.ts"
import {
  vossExplanationHasBoilerplate,
  vossExplanationHasRulesMeta,
  vossTextHasAbusiveRegister,
  vossTextHasModernRegister,
  vossVoice,
  vossVoiceRules,
} from "../src/data/vossVoice.ts"

const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")

const features: Array<[number, string]> = [
  [1, "spellcasting"],
  [1, "ritual-adept"],
  [1, "arcane-recovery"],
  [2, "scholar"],
  [4, "ability-score-improvement"],
  [5, "memorize-spell"],
  [8, "ability-score-improvement"],
  [12, "ability-score-improvement"],
  [16, "ability-score-improvement"],
  [18, "spell-mastery"],
  [19, "epic-boon"],
  [20, "signature-spells"],
]

const subclassIds = [
  "abjurer",
  "diviner",
  "evoker",
  "illusionist",
  "bladesinging",
  "order-of-scribes",
  "enchantment",
  "conjuration",
  "necromancy",
  "transmutation",
  "war-magic",
  "graviturgy",
  "chronurgy",
] as const

function assertNarration(text: string, label: string) {
  assert.ok(text.trim().length >= 100, `${label}: authored narration is too thin`)
  assert.equal(vossExplanationHasRulesMeta(text), false, `${label}: tabletop mechanics leaked into Voss narration`)
  assert.equal(vossExplanationHasBoilerplate(text), false, `${label}: renderer/rules boilerplate leaked into Voss narration`)
  assert.equal(vossTextHasModernRegister(text), false, `${label}: modern/office register leaked into Voss narration`)
  assert.equal(vossTextHasAbusiveRegister(text), false, `${label}: insult leaked into Voss narration`)
}

test("Voss grimdark calibration requires concrete consequences without profanity or insults", () => {
  assert.match(vossVoice.harshness, /обугленные силуэты|топор в черепе/iu)
  assert.match(vossVoice.harshness, /Мат, ругань и прямые оскорбления/iu)
  assert.ok(vossVoiceRules.some((rule) => /конкретным последствием.*обугленный силуэт/iu.test(rule)))
  assert.ok(vossVoiceRules.some((rule) => /Чёрный юмор.*безысходности/iu.test(rule)))
})

test("rebuilt Wizard class and every real base feature use the new Voss register", () => {
  assert.equal(wizardVossNarrationCoverage.length, features.length)
  assertNarration(wizardClassVossNarration, "class:wizard")
  assert.ok(wizardClassVossComment)

  const all = [wizardClassVossNarration]
  for (const [level, sourceKey] of features) {
    const narration = getWizardBaseVossNarration(level, sourceKey)
    const comment = getWizardBaseVossComment(level, sourceKey)
    assertNarration(narration, `class:wizard:${level}:${sourceKey}`)
    assert.ok(comment, `class:wizard:${level}:${sourceKey} is missing a Voss comment`)
    assert.equal(vossTextHasAbusiveRegister(comment), false)
    all.push(narration)
  }
  assert.equal(new Set(all).size, all.length, "Wizard narration must be unique per openable card")
})

test("all Wizard subclasses have distinct grimdark narration and comments", () => {
  assert.equal(wizardSubclassVossNarrationCoverage.length, subclassIds.length)
  const narrations: string[] = []
  for (const id of subclassIds) {
    const narration = getWizardSubclassVossNarration(id)
    const comment = getWizardSubclassVossComment(id)
    assertNarration(narration, `subclass:wizard:${id}`)
    assert.ok(comment, `subclass:wizard:${id} is missing a Voss comment`)
    assert.equal(vossTextHasModernRegister(comment), false, `subclass:wizard:${id}: modern register leaked into comment`)
    assert.equal(vossTextHasAbusiveRegister(comment), false, `subclass:wizard:${id}: insult leaked into comment`)
    narrations.push(narration)
  }
  assert.equal(new Set(narrations).size, narrations.length, "Wizard subclass narration must be unique per subclass")
})

test("Wizard reference exposes all catalog subclasses and text-only progressions", () => {
  const wizard = classReference.find((entry) => entry.id === "wizard")
  assert.ok(wizard)
  assert.deepEqual(wizard.subclasses.map((entry) => entry.id), [...subclassIds.slice(0, 4), ...subclassIds.slice(4, 6), ...subclassIds.slice(6)])
  assert.equal(wizard.subclasses.length, 13)

  for (const subclass of wizard.subclasses) {
    assert.ok(subclass.summary.trim(), `${subclass.id}: summary is missing`)
    assert.ok(subclass.mechanics?.trim(), `${subclass.id}: mechanics summary is missing`)
    assert.ok(subclass.features?.length, `${subclass.id}: feature translation is missing`)
    const levels = [...new Set((subclass.features || []).map((feature) => feature.level))]
    assert.deepEqual(levels, [3, 6, 10, 14], `${subclass.id}: translated progression is incomplete`)
  }
})

test("ReferenceGuide renders Wizard authored subclass text and preserves static features before runtime implementation", () => {
  assert.match(guide, /wizardClassVossNarration/)
  assert.match(guide, /getWizardBaseVossNarration\(feature\.level, feature\.sourceKey\)/)
  assert.match(guide, /getWizardBaseVossComment\(feature\.level, feature\.sourceKey\)/)
  assert.match(guide, /getWizardSubclassVossNarration\(item\.id\)/)
  assert.match(guide, /getWizardSubclassVossComment\(item\.id\)/)
  assert.match(guide, /referenceFeatures\(selectedSubclass\)/)
  assert.match(guide, /if \(!features\.length\) return authored/)
})
