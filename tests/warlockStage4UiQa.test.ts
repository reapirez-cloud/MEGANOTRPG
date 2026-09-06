import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { resolveTemplateChoiceStates } from "../src/rule-templates/choiceState.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"

const migration = readFileSync("supabase/migrations/20260906201356_choice_runtime_replacement_limit_and_warlock_stage4.sql", "utf8")
const choiceUi = readFileSync("src/components/characters/CharacterTemplateChoices.tsx", "utf8")
const choiceClient = readFileSync("src/lib/templateChoiceRuntime.ts", "utf8")

const invocationChoice: RuleChoiceDefinition = {
  key: "warlock_eldritch_invocations",
  label: "Мистические воззвания",
  target: "trait",
  selection_mode: "player_once",
  count: 1,
  count_by_level: { "1": 1, "2": 3, "5": 5, "7": 6, "9": 7, "12": 8, "15": 9, "18": 10 },
  replacement_policy: "on_level_change",
  replacement_limit: 1,
  options: [
    "agonizing-blast",
    "armor-of-shadows",
    "devils-sight",
    "pact-of-the-blade",
    "thirsting-blade",
    "devouring-blade",
  ],
  option_labels: {
    "agonizing-blast": "Мучительный взрыв",
    "armor-of-shadows": "Доспех теней",
    "devils-sight": "Дьявольское зрение",
    "pact-of-the-blade": "Договор клинка",
    "thirsting-blade": "Жаждущий клинок",
    "devouring-blade": "Пожирающий клинок",
  },
  option_rules: {
    "agonizing-blast": {
      min_level: 2,
      repeatable: true,
      selector: {
        key: "warlock_damage_cantrip",
        options: [
          { value: "eldritch-blast", label: "Мистический заряд" },
          { value: "chill-touch", label: "Леденящее прикосновение" },
        ],
      },
    },
    "armor-of-shadows": { min_level: 1 },
    "devils-sight": { min_level: 2 },
    "pact-of-the-blade": { min_level: 1 },
    "thirsting-blade": { min_level: 5, required_invocations: ["pact-of-the-blade"] },
    "devouring-blade": { min_level: 12, required_invocations: ["thirsting-blade"] },
  },
}

const tomeCantrips: RuleChoiceDefinition = {
  key: "warlock_pact_tome_cantrips",
  label: "Договор гримуара: заговоры",
  target: "trait",
  selection_mode: "player_once",
  count: 3,
  refresh: "short_or_long_rest",
  requires_choice: { key: "warlock_eldritch_invocations", option: "pact-of-the-tome" },
  options: ["guidance", "light", "mage-hand", "minor-illusion"],
}

function warlockBundle(includeTome = false): CharacterTemplateBundle {
  const invocationInstances = [
    { option: "agonizing-blast", selector: "warlock_damage_cantrip", selector_value: "eldritch-blast", config: {} },
    { option: "armor-of-shadows", config: {} },
    { option: "devils-sight", config: {} },
    { option: "pact-of-the-blade", config: {} },
    { option: "thirsting-blade", config: {} },
    ...(includeTome ? [{ option: "pact-of-the-tome", config: {} }] : []),
  ]
  const selectedChoices = {
    warlock_eldritch_invocations: invocationInstances.map((entry) => entry.option),
    ...(includeTome ? { warlock_pact_tome_cantrips: ["guidance", "light", "mage-hand"] } : {}),
    _choice_runtime_v2: {
      version: 2,
      choices: {
        warlock_eldritch_invocations: { source_level: 4, instances: invocationInstances },
        ...(includeTome ? {
          warlock_pact_tome_cantrips: {
            source_level: 5,
            refresh: "short_or_long_rest",
            instances: [
              { option: "guidance", config: {} },
              { option: "light", config: {} },
              { option: "mage-hand", config: {} },
            ],
          },
        } : {}),
      },
    },
  }

  return {
    assignment: {
      id: "assignment-warlock-stage4",
      character_id: "character-warlock-stage4",
      template_id: "class-warlock-stage4",
      template_level: 5,
      selected_choices: selectedChoices as never,
      assigned_at: "2026-09-06T00:00:00Z",
      updated_at: "2026-09-06T00:00:00Z",
    },
    template: {
      id: "class-warlock-stage4",
      campaign_id: "campaign",
      kind: "class",
      slug: "warlock",
      name: "Колдун",
      description: "Колдун 2024",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:warlock",
      catalog_revision: "xphb-2024-warlock-ui-qa-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-06T00:00:00Z",
      updated_at: "2026-09-06T00:00:00Z",
    },
    levels: [{
      id: "warlock-level-1",
      template_id: "class-warlock-stage4",
      level: 1,
      mechanics: [],
      choices: [invocationChoice, tomeCantrips],
    }],
  }
}

test("Stage 4 exposes one-invocation replacement after a Warlock level gain", () => {
  const state = resolveTemplateChoiceStates([warlockBundle()], 5).find((entry) => entry.key === "warlock_eldritch_invocations")
  assert.ok(state)
  assert.equal(state.runtimeVersion, 2)
  assert.equal(state.status, "editable")
  assert.equal(state.required, 5)
  assert.equal(state.previousSourceLevel, 4)
  assert.equal(state.replacementPolicy, "on_level_change")
  assert.equal(state.replacementLimit, 1)
})

test("Stage 4 presents selector targets and exact invocation lock reasons", () => {
  const state = resolveTemplateChoiceStates([warlockBundle()], 5).find((entry) => entry.key === "warlock_eldritch_invocations")
  assert.ok(state)

  const agonizing = state.options.find((entry) => entry.key === "agonizing-blast")
  assert.ok(agonizing?.selector)
  assert.equal(agonizing.repeatable, true)
  assert.deepEqual(agonizing.selector.options.map((entry) => entry.value), ["eldritch-blast", "chill-touch"])

  const thirsting = state.options.find((entry) => entry.key === "thirsting-blade")
  assert.equal(thirsting?.available, true)
  assert.deepEqual(thirsting?.requiredOptions, ["pact-of-the-blade"])

  const devouring = state.options.find((entry) => entry.key === "devouring-blade")
  assert.equal(devouring?.available, false)
  assert.equal(devouring?.lockedReason, "Доступно с 12 уровня")
})

test("Pact of the Tome choices stay hidden without Tome and become rest-editable with it", () => {
  const hidden = resolveTemplateChoiceStates([warlockBundle(false)], 5).find((entry) => entry.key === "warlock_pact_tome_cantrips")
  assert.equal(hidden?.status, "hidden")

  const visible = resolveTemplateChoiceStates([warlockBundle(true)], 5).find((entry) => entry.key === "warlock_pact_tome_cantrips")
  assert.ok(visible)
  assert.equal(visible.status, "editable")
  assert.equal(visible.refresh, "short_or_long_rest")
  assert.equal(visible.instances.length, 3)
})

test("Stage 4 migration enforces one replacement and keeps subclasses outside scope", () => {
  assert.match(migration, /'replacement_policy', 'on_level_change'/)
  assert.match(migration, /'replacement_limit', 1/)
  assert.match(migration, /CHOICE_REPLACEMENT_LIMIT_EXCEEDED/)
  assert.match(migration, /subclass_runtime_included', false/)
  assert.match(migration, /commit_character_template_choice_v2_core_stage4/)
})

test("character choice UI uses structured RPCs, selectors, lock reasons and no Warlock-only branch", () => {
  assert.match(choiceClient, /commit_character_template_choice_v2/)
  assert.match(choiceClient, /commit_character_template_rest_choice_v1/)
  assert.match(choiceUi, /Выберите цель/)
  assert.match(choiceUi, /lockedReason|dynamicLockedReason/)
  assert.match(choiceUi, /replacementLimit/)
  assert.doesNotMatch(choiceUi, /class:warlock|===\s*["']warlock["']/)
})
