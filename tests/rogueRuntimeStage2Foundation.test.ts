import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateChoiceStates } from "../src/rule-templates/choiceState.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import {
  WEAPON_CHOICE_CATALOG,
  weaponProficiencyCoversChoice,
} from "../src/rule-templates/weaponChoiceProvider.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260921120000_rogue_stage2_foundation_v1.sql", import.meta.url),
  "utf8",
)
const plan = readFileSync(
  new URL("../src/data/classes/rogueRuntimePlan.md", import.meta.url),
  "utf8",
)

function weaponChoiceBundle(): CharacterTemplateBundle {
  return {
    template: {
      id: "rogue",
      campaign_id: "campaign",
      kind: "class",
      slug: "rogue-core",
      name: "Разбойник",
      description: "Класс с владением оружием и постоянным выбором Weapon Mastery через общий Character Engine.",
      version: 1,
      mechanics: [
        {
          id: "simple",
          type: "grant",
          target: "proficiency",
          key: "weapon:simple",
          sourceKey: "weapon-simple",
          payload: { rank: 1 },
        },
        {
          id: "martial-filter",
          type: "grant",
          target: "proficiency",
          key: "weapon:martial-finesse-or-light",
          sourceKey: "weapon-martial-finesse-or-light",
          payload: { rank: 1 },
        },
      ],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:rogue",
      catalog_revision: "xphb-2024-rogue-stage2-foundation-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "К8 здоровья; Ловкость; простое оружие и ограниченная группа воинского оружия; постоянный выбор двух Weapon Mastery через общий Choice Runtime.",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    assignment: {
      id: "assignment",
      character_id: "character",
      template_id: "rogue",
      template_level: 1,
      selected_choices: {},
      assigned_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    levels: [{
      id: "rogue-l1",
      template_id: "rogue",
      level: 1,
      mechanics: [],
      choices: [{
        key: "rogue_weapon_mastery",
        label: "Оружейное мастерство",
        target: "trait",
        count: 2,
        selection_mode: "player_once",
        refresh: "long_rest",
        option_provider: { kind: "weapon_proficiencies" },
        options: ["weapon:dagger", "weapon:rapier", "weapon:longsword", "weapon:longbow"],
      }],
    }],
  }
}

test("Stage 2 foundation passes the shared class quality, resource, parser and CE gates", () => {
  const bundle = weaponChoiceBundle()
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))

  const parsed = resolveTemplateBundles([bundle], 1)
  const contract = resolveCharacterContract({
    base: {
      id: "character",
      name: "Разбойник",
      level: 1,
      abilities: {
        strength: 10,
        dexterity: 18,
        constitution: 14,
        intelligence: 12,
        wisdom: 10,
        charisma: 12,
      },
      baseMaxHp: 10,
      baseSpeed: 30,
    },
    state: { currentHp: 10, tempHp: 0 },
    contributions: parsed.contributions,
  })

  assert.ok(parsed.contributions.some((entry) =>
    entry.kind === "grant"
    && entry.target === "proficiency"
    && entry.key === "weapon:simple"
  ))
  assert.ok(contract.capabilities.proficiencies.some((entry) => entry.key === "weapon:simple"))
})

test("generic weapon provider understands Rogue category proficiencies", () => {
  assert.equal(WEAPON_CHOICE_CATALOG.length, 38)
  assert.equal(weaponProficiencyCoversChoice("weapon:simple", "weapon:dagger"), true)
  assert.equal(weaponProficiencyCoversChoice("weapon:martial-finesse-or-light", "weapon:rapier"), true)
  assert.equal(weaponProficiencyCoversChoice("weapon:martial-finesse-or-light", "weapon:shortsword"), true)
  assert.equal(weaponProficiencyCoversChoice("weapon:martial-finesse-or-light", "weapon:longsword"), false)
  assert.equal(weaponProficiencyCoversChoice("weapon:martial", "weapon:longbow"), true)
})

test("choice read model filters Weapon Mastery by active CE proficiencies", () => {
  const state = resolveTemplateChoiceStates([weaponChoiceBundle()], 1)
    .find((choice) => choice.key === "rogue_weapon_mastery")
  assert.ok(state)
  assert.equal(state.runtimeVersion, 2)
  assert.equal(state.refresh, "long_rest")
  assert.equal(state.options.find((option) => option.key === "weapon:dagger")?.available, true)
  assert.equal(state.options.find((option) => option.key === "weapon:rapier")?.available, true)
  assert.equal(state.options.find((option) => option.key === "weapon:longsword")?.available, false)
  assert.equal(state.options.find((option) => option.key === "weapon:longbow")?.available, false)
})

test("Stage 2 installs one shared-architecture Rogue foundation without subclasses", () => {
  assert.match(migration, /catalog_key='class:rogue'/)
  assert.match(migration, /xphb-2024-rogue-stage2-foundation-v1/)
  assert.match(migration, /for v_level in 1\.\.20 loop/i)
  assert.match(migration, /IN_PROGRESS_STAGE2_FOUNDATION_READY/)
  assert.match(migration, /subclass_runtime_included',false/)
  assert.match(migration, /ROGUE_STAGE2_SUBCLASS_RUNTIME_LEAK/)
  assert.match(migration, /subclass:rogue:scion-of-the-three/)
  assert.doesNotMatch(migration, /mechanics_status','READY'/)
})

test("Stage 2 owns the exact base proficiency and persistent-choice foundation", () => {
  for (const key of [
    "savingThrow:dexterity",
    "savingThrow:intelligence",
    "armor:light",
    "weapon:simple",
    "weapon:martial-finesse-or-light",
    "tool:thieves-tools",
    "thieves-cant",
  ]) {
    assert.ok(migration.includes(key), key)
  }
  assert.match(migration, /'rogue-skills'[\\s\\S]*?'count',4/)
  assert.match(migration, /'rogue-extra-language'[\\s\\S]*?'count',1/)
  assert.match(migration, /'rogue_expertise'[\\s\\S]*?'count_by_level',jsonb_build_object\('1',2,'6',4\)/)
  assert.match(migration, /'kind','skill_proficiencies','minimum_rank',1,'maximum_rank',1/)
  assert.match(migration, /'rogue_weapon_mastery'[\\s\\S]*?'refresh','long_rest'/)
  assert.match(migration, /'kind','weapon_proficiencies'/)
})

test("Stage 2 freezes Sneak Attack progression as deterministic Rogue-level data", () => {
  for (const [level, dice] of [[1,1],[3,2],[5,3],[7,4],[9,5],[11,6],[13,7],[15,8],[17,9],[19,10]]) {
    assert.ok(
      migration.includes(`(${level},${dice})`),
      `missing certified Sneak Attack progression ${level} -> ${dice}d6`,
    )
  }
  assert.match(migration, /rogue_sneak_attack_dice/)
  assert.match(migration, /rogue_sneak_attack_die_sides/)
})

test("Stage 2 extends provider validation on server and on rest refreshes", () => {
  assert.match(migration, /character_has_weapon_proficiency_for_choice_v1/)
  assert.match(migration, /CHOICE_PROVIDER_WEAPON_PROFICIENCY_INELIGIBLE/)
  assert.match(migration, /create or replace function public\.commit_character_template_rest_choice_v1/)
  assert.match(
    migration,
    /commit_character_template_rest_choice_v1[\s\S]*?validate_choice_option_provider_v1/,
  )
})

test("Stage 2 plan remains non-READY until later Rogue stages", () => {
  assert.match(plan, /Stage 2 — clean class foundation and 1–20 progression/)
  assert.match(plan, /Stage 7 — final fail-closed certification/)
})
