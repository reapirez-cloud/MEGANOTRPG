import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanics } from "../src/types/characterMechanics.ts"

const completion = fs.readFileSync("supabase/migrations/20260904130000_monk_runtime_completion.sql", "utf8")
const precision = fs.readFileSync("supabase/migrations/20260904124500_monk_2024_rules_precision.sql", "utf8")

const level14: StoredMechanics = [
  ...(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const).map((ability) => ({
    id: `save-${ability}`,
    type: "grant" as const,
    target: "proficiency" as const,
    key: `savingThrow:${ability}`,
    sourceKey: "monk-disciplined-survivor",
    payload: { rank: 1 as const },
  })),
]

const level20: StoredMechanics = [
  { id: "dex-add", type: "numeric", target: "abilities.dexterity", operation: "ADD", value: 4, sourceKey: "monk-body-and-mind", priority: 20 },
  { id: "dex-cap", type: "numeric", target: "abilities.dexterity", operation: "MAX", value: 25, sourceKey: "monk-body-and-mind", priority: 20 },
  { id: "wis-add", type: "numeric", target: "abilities.wisdom", operation: "ADD", value: 4, sourceKey: "monk-body-and-mind", priority: 20 },
  { id: "wis-cap", type: "numeric", target: "abilities.wisdom", operation: "MAX", value: 25, sourceKey: "monk-body-and-mind", priority: 20 },
]

function bundle(level: number): CharacterTemplateBundle {
  return {
    assignment: { id: "a", character_id: "c", template_id: "monk", template_level: level, selected_choices: {}, assigned_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z" },
    template: {
      id: "monk", campaign_id: "camp", kind: "class", slug: "monk-core", name: "Монах", description: "Монах 2024", version: 1,
      mechanics: [], choices: [], catalog_key: "class:monk", catalog_revision: "xphb-2024-monk-runtime-v1", source_kind: "official",
      source_label: "XPHB 2024", is_builtin: true,
      mechanical_summary: "Монах использует Очки концентрации, Боевые искусства и высокую мобильность с точной классовой прогрессией.",
      is_active: true, created_by: null, created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    },
    levels: [
      { id: "l14", template_id: "monk", level: 14, mechanics: level14, choices: [] },
      { id: "l20", template_id: "monk", level: 20, mechanics: level20, choices: [] },
    ],
  }
}

function input(level: number, dexterity: number, wisdom: number): CharacterEngineInput {
  const parsed = resolveTemplateBundles([bundle(level)], level)
  return {
    base: {
      id: "c", name: "Монах", level,
      abilities: { strength: 10, dexterity, constitution: 14, intelligence: 10, wisdom, charisma: 8 },
      baseMaxHp: 100, baseSpeed: 30,
    },
    state: { currentHp: 100, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  }
}

test("Disciplined Survivor grants native proficiency in every saving throw", () => {
  const contract = resolveCharacterContract(input(14, 18, 16))
  for (const ability of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const) {
    assert.equal(contract.savingThrows[ability].proficiencyRank, 1)
  }
})

test("Body and Mind adds four to Dexterity and Wisdom and caps each at 25", () => {
  const normal = resolveCharacterContract(input(20, 18, 16))
  assert.equal(normal.abilities.dexterity.value, 22)
  assert.equal(normal.abilities.wisdom.value, 20)

  const capped = resolveCharacterContract(input(20, 24, 23))
  assert.equal(capped.abilities.dexterity.value, 25)
  assert.equal(capped.abilities.wisdom.value, 25)
})

test("completion migration installs native saves and Body and Mind", () => {
  assert.match(completion, /savingThrow:'\|\|v_save/)
  for (const ability of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]) {
    assert.match(completion, new RegExp(ability))
  }
  assert.match(completion, /abilities\.dexterity'[\s\S]*'ADD'[\s\S]*'value',4/)
  assert.match(completion, /abilities\.dexterity'[\s\S]*'MAX'[\s\S]*'value',25/)
  assert.match(completion, /abilities\.wisdom'[\s\S]*'ADD'[\s\S]*'value',4/)
  assert.match(completion, /abilities\.wisdom'[\s\S]*'MAX'[\s\S]*'value',25/)
})

test("precision migration contains corrected 2024 base rules", () => {
  assert.match(precision, /Безоружный удар можно сделать бонусным действием/)
  assert.match(precision, /Очарован, Испуган или Отравлен/)
  assert.match(precision, /отсутствие еды и питья не даёт монаху уровни Истощения/)
  assert.match(precision, /При успехе её Скорость уменьшается вдвое/)
})
