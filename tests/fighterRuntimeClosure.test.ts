import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterContribution,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"

const closure = fs.readFileSync(
  "supabase/migrations/20260905200000_fighter_runtime_closure_v2.sql",
  "utf8",
)
const retiredDraft = fs.readFileSync(
  "supabase/migrations/20260905123000_fighter_subclass_runtime_repair.sql",
  "utf8",
)
const retiredCompletion = fs.readFileSync(
  "supabase/migrations/20260905190100_fighter_completion_reapply.sql",
  "utf8",
)
const retiredPsi = fs.readFileSync(
  "supabase/migrations/20260905190200_fighter_psi_runtime_reapply.sql",
  "utf8",
)

const fighterTemplate: RuleTemplate = {
  id: "fighter-runtime-test",
  campaign_id: "campaign",
  kind: "class",
  slug: "fighter",
  name: "Воин",
  description: "Воин получает боевые ресурсы и выбирает боевой архетип по мере роста уровня.",
  version: 1,
  mechanics: [],
  choices: [],
  parent_template_id: null,
  unlock_level: null,
  catalog_key: "class:fighter",
  catalog_revision: "fighter-runtime-closure-test",
  source_kind: "official",
  source_label: "Official",
  is_builtin: true,
  mechanical_summary: "Базовый воин использует конечные боевые ресурсы, прогрессию атак и выбранный подкласс на уровнях класса.",
  author_description: "",
  author_comment: "",
  rules_meta: {},
  is_active: true,
  created_by: null,
  created_at: "2026-09-05T00:00:00Z",
  updated_at: "2026-09-05T00:00:00Z",
}

const championTemplate: RuleTemplate = {
  ...fighterTemplate,
  id: "champion-runtime-test",
  kind: "subclass",
  slug: "fighter-champion",
  name: "Чемпион",
  description: "Чемпион расширяет диапазон критических попаданий обычных атак по мере роста уровня воина.",
  parent_template_id: fighterTemplate.id,
  unlock_level: 3,
  catalog_key: "subclass:fighter:champion",
  mechanical_summary: "Чемпион снижает порог критического попадания атак с 20 до 19 на 3-м уровне воина и до 18 на 15-м уровне.",
}

function assignment(templateId: string, level: number) {
  return {
    id: `assignment:${templateId}`,
    character_id: "fighter-hero",
    template_id: templateId,
    template_level: level,
    selected_choices: {},
    assigned_at: "2026-09-05T00:00:00Z",
    updated_at: "2026-09-05T00:00:00Z",
  }
}

function fighterBundle(): CharacterTemplateBundle {
  return {
    template: fighterTemplate,
    assignment: assignment(fighterTemplate.id, 15),
    levels: [],
  }
}

function championBundle(): CharacterTemplateBundle {
  return {
    template: championTemplate,
    assignment: assignment(championTemplate.id, 15),
    levels: [
      {
        id: "champion-l3",
        template_id: championTemplate.id,
        level: 3,
        choices: [],
        mechanics: [{
          id: "champion-critical-19",
          type: "grant",
          target: "value",
          key: "attack_critical_threshold",
          sourceKey: "champion-improved-critical",
          grantOperation: "REPLACE",
          priority: 3,
          payload: { label: "Порог критического попадания", value: 19 },
        }],
      },
      {
        id: "champion-l15",
        template_id: championTemplate.id,
        level: 15,
        choices: [],
        mechanics: [{
          id: "champion-critical-18",
          type: "grant",
          target: "value",
          key: "attack_critical_threshold",
          sourceKey: "champion-superior-critical",
          grantOperation: "REPLACE",
          priority: 15,
          payload: { label: "Порог критического попадания", value: 18 },
        }],
      },
    ],
  }
}

function weaponAttack(): CharacterContribution {
  return {
    id: "fighter-runtime-test-attack",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "weapon_attack",
    payload: {
      label: "Атака оружием",
      economy: "action",
      attack: { bonus: { kind: "literal", value: 7 } },
    },
    source: { id: "fighter-runtime-test", name: "Воин" },
  }
}

function engineInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "fighter-hero",
      name: "Воин-чемпион",
      level: 15,
      abilities: { strength: 18, dexterity: 12, constitution: 16, intelligence: 8, wisdom: 10, charisma: 14 },
      baseMaxHp: 120,
      baseSpeed: 30,
    },
    state: { currentHp: 120, tempHp: 0 },
    contributions,
  }
}

test("Fighter closure uses immutable verified repair sources", () => {
  assert.match(closure, /0eb033963217dc96d9bd4624d3035d544fe81ccf/)
  for (const bytes of [3566, 94644, 13637, 6657, 15375]) {
    assert.match(closure, new RegExp(`octet_length\\(v_sql\\) <> ${bytes}`))
  }
  assert.doesNotMatch(closure, /raw\.githubusercontent\.com\/reapirez-cloud\/MEGANOTRPG\/(dev|main)\//)
})

test("Fighter closure explicitly repairs the Battle Master JSON defect", () => {
  assert.match(closure, /expected exactly one malformed Battle Master boundary/)
  assert.match(closure, /replace\(v_sql, '\}\]\}\}\]\}\}', '\}\]\}\]\}\}'\)/)
  assert.match(closure, /battle_master_maneuvers/)
  assert.match(closure, /jsonb_array_length[\s\S]*= 20/)
})

test("Psi free Telekinesis is removed only from the class-spell layer", () => {
  assert.match(closure, /fighter-psi-telekinesis-spell/)
  assert.match(closure, /private\.fighter_psi_restore_action/)
  assert.match(closure, /invalid Psi Telekinesis class-spell mechanic remains/)
})

test("closure validates persistent choices, resources and Champion thresholds", () => {
  for (const key of [
    "arcane_shot_options",
    "battle_master_maneuvers",
    "rune_knight_runes",
    "attack_critical_threshold",
    "mechanics_authority",
  ]) assert.match(closure, new RegExp(key))

  assert.match(closure, /choice action references an undeclared resource/)
  assert.match(closure, /top-level action references an undeclared resource/)
  assert.match(closure, /snapshot table was not cleaned up/)
})

test("Fighter strict package reaches resolver and Character Engine with Champion 18-20 criticals", () => {
  const packages = [fighterBundle(), championBundle()]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  assert.doesNotThrow(() => assertClassResourcePolicy(packages))

  const parsed = resolveTemplateBundles(packages, 15)
  const contract = resolveCharacterContract(engineInput([...parsed.contributions, weaponAttack()]))
  const attack = contract.actions.find((action) => action.key === "weapon_attack")

  assert.ok(attack)
  assert.equal(attack.attack?.criticalThreshold, 18)
})

test("unapplied broken Fighter drafts are inert and point at the closure", () => {
  for (const draft of [retiredDraft, retiredCompletion, retiredPsi]) {
    assert.match(draft, /20260905200000_fighter_runtime_closure_v2\.sql/)
    assert.match(draft, /select 1;/)
    assert.doesNotMatch(draft, /extensions\.http_get/)
  }
})
