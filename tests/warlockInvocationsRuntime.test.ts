import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import {
  mechanicsForStructuredChoiceInstance,
  structuredChoiceInstances,
} from "../src/rule-templates/choiceRuntimeV2.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"

const catalog = readFileSync("supabase/migrations/20260906073433_warlock_2024_eldritch_invocations_catalog.sql", "utf8")
const restRefresh = readFileSync("supabase/migrations/20260906192500_choice_runtime_rest_refresh_v1.sql", "utf8")
const runtime = readFileSync("supabase/migrations/20260906193000_warlock_invocations_runtime_v1.sql", "utf8")

const feature = (id: string, key: string, description: string, mechanic: Record<string, unknown>) => ({
  id,
  type: "grant" as const,
  target: "feature" as const,
  key,
  sourceKey: `warlock-invocation:${key}`,
  payload: { label: key, description, mechanic },
})

const invocationChoice = {
  key: "warlock_eldritch_invocations",
  label: "Мистические воззвания",
  target: "trait",
  options: ["agonizing-blast", "pact-of-the-blade", "thirsting-blade"],
  count: 4,
  selection_mode: "player_once",
  required: true,
  option_rules: {
    "agonizing-blast": {
      min_level: 2,
      repeatable: true,
      mechanics: [feature(
        "agonizing-rule",
        "agonizing_blast",
        "Выбранный наносящий урон заговор добавляет модификатор Харизмы к каждому броску урона.",
        { kind: "cantrip_damage_modifier", selected_cantrip: "{{choice.selector_value}}", ability: "charisma" },
      )],
    },
    "pact-of-the-blade": {
      mechanics: [feature(
        "blade-rule",
        "pact_of_the_blade",
        "Оружие договора использует Харизму для бросков атаки и урона и сохраняет точные свойства договора.",
        { kind: "pact_boon_blade", ability: "charisma" },
      )],
    },
    "thirsting-blade": {
      min_level: 5,
      required_invocations: ["pact-of-the-blade"],
      mechanics: [
        feature(
          "thirsting-rule",
          "thirsting_blade",
          "При действии Атака оружием договора можно атаковать дважды вместо одного раза.",
          { kind: "pact_weapon_extra_attack", total_attacks: 2 },
        ),
        {
          id: "thirsting-value",
          type: "grant" as const,
          target: "value" as const,
          key: "warlock_pact_weapon_attack_count",
          sourceKey: "warlock-invocation:thirsting-blade",
          payload: { label: "Атаки оружием договора", value: 2 },
        },
      ],
    },
  },
} as unknown as RuleChoiceDefinition

function selectedChoices(includeBlade = true) {
  const instances = [
    { option: "agonizing-blast", selector: "warlock_damage_cantrip", selector_value: "eldritch-blast", config: {} },
    { option: "agonizing-blast", selector: "warlock_damage_cantrip", selector_value: "chill-touch", config: {} },
    ...(includeBlade ? [{ option: "pact-of-the-blade", config: {} }] : []),
    { option: "thirsting-blade", config: {} },
  ]
  return {
    warlock_eldritch_invocations: instances.map((entry) => entry.option),
    _choice_runtime_v2: {
      version: 2,
      choices: {
        warlock_eldritch_invocations: { source_level: 5, instances },
      },
    },
  }
}

function bundle(includeBlade = true): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-warlock-stage3",
      character_id: "character-warlock-stage3",
      template_id: "class-warlock-stage3",
      template_level: 5,
      selected_choices: selectedChoices(includeBlade) as never,
      assigned_at: "2026-09-06T00:00:00Z",
      updated_at: "2026-09-06T00:00:00Z",
    },
    template: {
      id: "class-warlock-stage3",
      campaign_id: "campaign",
      kind: "class",
      slug: "warlock-stage3",
      name: "Колдун",
      description: "Колдун 2024 с подключёнными Мистическими воззваниями.",
      version: 1,
      mechanics: [feature(
        "stage3-marker",
        "eldritch_invocations_runtime",
        "Мистические воззвания являются постоянными выборами класса с требованиями уровня, зависимостями и точными эффектами.",
        { kind: "eldritch_invocation_runtime" },
      )],
      choices: [invocationChoice],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:warlock",
      catalog_revision: "xphb-2024-warlock-invocations-runtime-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Колдун использует структурированные Мистические воззвания, Магию договора и постоянные выборы с проверяемыми требованиями.",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-06T00:00:00Z",
      updated_at: "2026-09-06T00:00:00Z",
    },
    levels: [],
  }
}

test("Warlock Stage 3 keeps the complete 28-invocation catalog", () => {
  const identities = new Set([...catalog.matchAll(/class:warlock:invocation:([a-z0-9-]+)/g)].map((match) => match[1]))
  assert.equal(identities.size, 28)
  assert.match(runtime, /jsonb_array_length\(v_options\) <> 28/)
  assert.match(runtime, /'1',1,'2',3,'5',5,'7',6,'9',7,'12',8,'15',9,'18',10/)
  assert.match(runtime, /BASE_AND_INVOCATIONS_RUNTIME_READY/)
  assert.match(runtime, /'subclass_runtime_included',false/)
})

test("structured Choice Runtime preserves repeated invocation selector instances", () => {
  const instances = structuredChoiceInstances(invocationChoice, selectedChoices(true), 5)
  assert.equal(instances.length, 4)
  assert.deepEqual(
    instances.filter((entry) => entry.option === "agonizing-blast").map((entry) => entry.selector_value),
    ["eldritch-blast", "chill-touch"],
  )
  const mechanics = mechanicsForStructuredChoiceInstance(invocationChoice, instances[0]!, 5, 0)
  const serialized = JSON.stringify(mechanics)
  assert.match(serialized, /eldritch-blast/)
  assert.doesNotMatch(serialized, /\{\{choice\.selector_value\}\}/)
})

test("stale dependent invocations become inert when their prerequisite disappears", () => {
  const instances = structuredChoiceInstances(invocationChoice, selectedChoices(false), 5)
  assert.equal(instances.some((entry) => entry.option === "thirsting-blade"), false)
})

test("repeatable selector instances reach parser and Character Engine as distinct structured rules", () => {
  const source = bundle(true)
  assert.doesNotThrow(() => assertClassPackageQuality([source]))
  assert.doesNotThrow(() => assertClassResourcePolicy([source]))
  const parsed = resolveTemplateBundles([source], 5)
  const contract = resolveCharacterContract({
    base: {
      id: "warlock-stage3",
      name: "Колдун",
      level: 5,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 40,
      baseSpeed: 30,
    },
    state: { currentHp: 40, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  })
  const agonizing = contract.rules.filter((entry) => entry.key === "agonizing_blast")
  assert.equal(agonizing.length, 2)
  assert.deepEqual(
    agonizing.map((entry) => (entry.mechanic as Record<string, unknown>).selected_cantrip).sort(),
    ["chill-touch", "eldritch-blast"],
  )
  assert.equal(contract.values.find((entry) => entry.key === "warlock_pact_weapon_attack_count")?.value.value, 2)
})

test("runtime migration dispatches catalog hints without 28 source-specific branches", () => {
  for (const kind of [
    "at_will_spell",
    "sense",
    "pact_weapon_extra_attack",
    "pact_weapon_extra_attack_upgrade",
    "on_hit_pact_slot",
    "compound",
    "book_of_shadows_protection",
    "pact_boon_chain",
  ]) assert.match(runtime, new RegExp(kind))
  assert.match(runtime, /private\.warlock_invocation_mechanics_v1/)
  assert.match(runtime, /r\.data->'runtime_hint'/)
  assert.match(runtime, /runtime_ready/)
})

test("Pact of the Tome uses dependent short-or-long-rest choices", () => {
  assert.match(runtime, /warlock_pact_tome_cantrips/)
  assert.match(runtime, /warlock_pact_tome_rituals/)
  assert.match(runtime, /'count', 3/)
  assert.match(runtime, /'count', 2/)
  assert.match(runtime, /'refresh', 'short_or_long_rest'/)
  assert.match(runtime, /'option','pact-of-the-tome'/)
  assert.match(restRefresh, /character_short_rest_sessions/)
  assert.match(restRefresh, /private\.is_character_preparation_open/)
  assert.match(restRefresh, /revoke all on function public\.commit_character_template_rest_choice_v1\(uuid,text,jsonb\) from public, anon/)
  assert.match(restRefresh, /auth\.uid\(\)/)
})

test("scene and turn gates stay semantic instead of inventing runtime state", () => {
  assert.match(runtime, /gm_hit_gate/)
  assert.match(runtime, /gm_turn_gate/)
  assert.match(runtime, /gm_trigger_gate/)
  assert.doesNotMatch(runtime, /turn_counter|target_is_hit|scene_light_state_confirmed/)
})
