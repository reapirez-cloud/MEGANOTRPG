import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  getWizardBaseVossComment,
  getWizardBaseVossNarration,
  wizardClassVossComment,
  wizardClassVossNarration,
  wizardVossNarrationCoverage,
} from "../src/data/classes/wizardVossNarration.ts"
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

test("ReferenceGuide overrides stored Wizard text but does not invent unfinished subclasses", () => {
  assert.match(guide, /wizardClassVossNarration/)
  assert.match(guide, /getWizardBaseVossNarration\(feature\.level, feature\.sourceKey\)/)
  assert.match(guide, /getWizardBaseVossComment\(feature\.level, feature\.sourceKey\)/)
  assert.doesNotMatch(guide, /getWizardSubclassVossNarration/)
})
