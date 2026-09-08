import assert from "node:assert/strict"
import test from "node:test"

import { paladinReferenceComplete } from "../src/data/classes/paladinReferenceComplete.ts"
import { applyPaladinReferencePresentation } from "../src/data/classes/paladinReferencePresentation.ts"
import type { RuleTemplate, RuleTemplateLevel } from "../src/rule-templates/types.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

function featureGrant(name: string, sourceKey: string): StoredMechanic {
  return {
    id: `${sourceKey}:grant`,
    type: "grant",
    target: "feature",
    key: `${sourceKey}:feature`,
    sourceKey,
    payload: {
      label: name,
      description: "RUNTIME PLACEHOLDER",
    },
  } as unknown as StoredMechanic
}

function grantPayload(mechanic: StoredMechanic) {
  assert.equal(mechanic.type, "grant")
  return mechanic.payload as unknown as Record<string, unknown>
}

test("Paladin presentation restores authored base translation over runtime mechanics", () => {
  const authored = paladinReferenceComplete.features.find((feature) => feature.name === "Возложение рук")
  assert.ok(authored)
  assert.ok(authored.explanation.length > 100)
  assert.ok(authored.mechanics.length > 0)

  const paladin = {
    id: "paladin-template",
    kind: "class",
    catalog_key: "class:paladin",
    mechanics: [],
  } as unknown as RuleTemplate
  const level = {
    id: "paladin-level-1",
    template_id: paladin.id,
    level: authored.level,
    mechanics: [featureGrant(authored.name, "paladin-base:lay-on-hands")],
    choices: [],
  } as unknown as RuleTemplateLevel

  const presented = applyPaladinReferencePresentation([paladin], [level])
  const decoratedPaladin = presented.templates[0]
  const decoratedGrant = presented.levels[0].mechanics[0]
  const payload = grantPayload(decoratedGrant)

  assert.equal(decoratedPaladin.author_description, paladinReferenceComplete.explanation)
  assert.equal(decoratedPaladin.author_comment, paladinReferenceComplete.voss)
  assert.equal(payload.label, authored.name)
  assert.equal(payload.description, authored.mechanics)
  assert.equal(payload.authorExplanation, authored.explanation)
  assert.equal(payload.authorComment, authored.voss)
  assert.equal(decoratedGrant.presentation?.authorExplanation, authored.explanation)
  assert.equal(decoratedGrant.presentation?.authorComment, authored.voss)
})

test("Paladin presentation restores Oath of the Ancients authored translation", () => {
  assert.equal(paladinReferenceComplete.subclasses.length, 15)
  const ancients = paladinReferenceComplete.subclasses.find((subclass) => subclass.id === "ancients")
  assert.ok(ancients)
  assert.ok(ancients.explanation && ancients.explanation.length > 100)
  assert.ok(ancients.features?.length)
  const authored = ancients.features[0]
  assert.ok(authored.explanation.length > 100)
  assert.ok(authored.mechanics.length > 0)

  const paladin = {
    id: "paladin-template",
    kind: "class",
    catalog_key: "class:paladin",
    mechanics: [],
  } as unknown as RuleTemplate
  const subclass = {
    id: "ancients-template",
    kind: "subclass",
    parent_template_id: paladin.id,
    catalog_key: "subclass:paladin:ancients",
    unlock_level: 3,
    mechanics: [],
  } as unknown as RuleTemplate
  const level = {
    id: "ancients-level",
    template_id: subclass.id,
    level: authored.level,
    mechanics: [featureGrant(authored.name, "paladin-ancients:test-feature")],
    choices: [],
  } as unknown as RuleTemplateLevel

  const presented = applyPaladinReferencePresentation([paladin, subclass], [level])
  const decoratedSubclass = presented.templates.find((template) => template.id === subclass.id)
  const decoratedGrant = presented.levels[0].mechanics[0]
  const payload = grantPayload(decoratedGrant)

  assert.equal(decoratedSubclass?.author_description, ancients.explanation)
  assert.equal(decoratedSubclass?.author_comment, ancients.voss)
  assert.equal(payload.label, authored.name)
  assert.equal(payload.description, authored.mechanics)
  assert.equal(payload.authorExplanation, authored.explanation)
  assert.equal(payload.authorComment, authored.voss)
})

test("all Paladin oath cards still carry authored Russian presentation", () => {
  assert.equal(paladinReferenceComplete.subclasses.length, 15)
  for (const subclass of paladinReferenceComplete.subclasses) {
    assert.ok(subclass.name.trim(), `${subclass.id}: missing translated name`)
    assert.ok(subclass.explanation?.trim(), `${subclass.id}: missing authored description`)
    assert.ok(subclass.voss?.trim(), `${subclass.id}: missing Voss comment`)
    assert.ok(subclass.features?.length, `${subclass.id}: missing translated features`)
    for (const feature of subclass.features || []) {
      assert.ok(feature.name.trim(), `${subclass.id}: feature missing translated name`)
      assert.ok(feature.explanation.trim(), `${subclass.id}/${feature.name}: missing authored explanation`)
      assert.ok(feature.mechanics.trim(), `${subclass.id}/${feature.name}: missing translated mechanics`)
    }
  }
})
