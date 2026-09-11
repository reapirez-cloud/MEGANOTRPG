import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  applySpellResourceOption,
  resolveCharacterContract,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import { resolveTemplateChoiceStates } from "../src/rule-templates/choiceState.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260911101000_bard_base_runtime_stage4_v1.sql",
  "utf8",
)

const skills = [
  "skill:acrobatics","skill:animal_handling","skill:arcana","skill:athletics",
  "skill:deception","skill:history","skill:insight","skill:intimidation",
  "skill:investigation","skill:medicine","skill:nature","skill:perception",
  "skill:performance","skill:persuasion","skill:religion","skill:sleight_of_hand",
  "skill:stealth","skill:survival",
]

const labels = Object.fromEntries(skills.map((key) => [key, key]))

const expertiseChoice: RuleChoiceDefinition = {
  key: "bard_expertise",
  label: "Экспертиза барда",
  target: "proficiency",
  count: 2,
  count_by_level: { "2": 2, "9": 4 },
  selection_mode: "player_once",
  required: true,
  options: skills,
  option_labels: labels,
  option_provider: {
    kind: "skill_proficiencies",
    minimum_rank: 1,
    maximum_rank: 1,
  },
  option_mechanics: Object.fromEntries(skills.map((key) => [key, [{
    id: `expertise-${key.replace(":", "-")}`,
    type: "grant",
    sourceKey: "expertise",
    target: "proficiency",
    key,
    payload: { rank: 2 },
  }]])),
}

function feature(id: string, sourceKey: string, key: string, label: string, description: string, mechanic?: Record<string, unknown>): StoredMechanic {
  return {
    id,
    type: "grant",
    sourceKey,
    target: "feature",
    key,
    payload: {
      label,
      description,
      ...(mechanic ? { mechanic } : {}),
    },
  }
}

function wordsSpell(slug: string, name: string): StoredMechanic {
  return {
    id: `words-${slug}`,
    type: "spell",
    sourceKey: "words-of-creation",
    key: `spell:${slug}`,
    catalogSlug: slug,
    variantKey: `bard:spellcasting:${slug}`,
    payload: {
      spell: { name, level: 9, school: "enchantment", ritual: false },
      preparation: { mode: "always_prepared" },
      methods: [{
        key: "bard-cast",
        kind: "class_spell",
        ability: "charisma",
        requiresPrepared: false,
        resourceOptions: [{
          key: "slot-9",
          castLevel: 9,
          costs: [{ key: "spell_slot_9", amount: 1 }],
        }],
      }],
    },
  }
}

function bardBundle(level: number, expertise: string[] = []): CharacterTemplateBundle {
  const levels = Array.from({ length: 20 }, (_, index) => ({
    id: `bard-stage4-level-${index + 1}`,
    template_id: "bard-stage4-template",
    level: index + 1,
    mechanics: [] as StoredMechanic[],
    choices: [] as RuleChoiceDefinition[],
  }))

  levels[0]!.mechanics.push({
    id: "test-spell-slot-9",
    type: "resource",
    sourceKey: "spellcasting",
    key: "spell_slot_9",
    label: "Ячейки 9 уровня",
    max: 1,
    recharge: ["long_rest"],
    initial: "full",
  })

  levels[0]!.choices.push({
    key: "bard-skills",
    label: "Навыки: Бард",
    target: "proficiency",
    count: 3,
    selection_mode: "player_once",
    options: skills,
    option_labels: labels,
  })

  levels[1]!.choices.push(expertiseChoice)
  levels[1]!.mechanics.push(
    feature(
      "bard-expertise-feature-l2",
      "expertise",
      "class:bard:expertise:l2",
      "Экспертиза",
      "На 2 уровне выберите два навыка, которыми владеете. На 9 уровне выберите ещё два таких навыка.",
      { kind: "expertise_choice", choice_key: "bard_expertise", count_by_level: { 2: 2, 9: 4 } },
    ),
    feature(
      "bard-jack-feature-l2",
      "jack-of-all-trades",
      "class:bard:jack-of-all-trades:l2",
      "Мастер на все руки",
      "К проверке навыка без владения добавляется половина бонуса мастерства с округлением вниз.",
      { kind: "untrained_skill_proficiency_fraction", numerator: 1, denominator: 2, round: "down" },
    ),
    {
      id: "bard-jack-permission-l2",
      type: "grant",
      sourceKey: "jack-of-all-trades",
      target: "permission",
      key: "skill_check:untrained_proficiency_fraction",
      payload: { numerator: 1, denominator: 2, round: "down" },
    },
  )

  for (const asiLevel of [4, 8, 12, 16]) {
    levels[asiLevel - 1]!.mechanics.push(feature(
      `bard-asi-${asiLevel}`,
      "ability-score-improvement",
      `class:bard:ability-score-improvement:l${asiLevel}`,
      "Улучшение характеристик",
      "Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете.",
      {
        kind: "feat_choice",
        choice_count: 1,
        source_level: asiLevel,
        allowed: "ability_score_improvement_or_qualified_feat",
        runtime_owner: "generic_feat_source_pending",
      },
    ))
  }

  levels[6]!.mechanics.push(
    feature(
      "bard-countercharm-feature-l7",
      "countercharm",
      "class:bard:countercharm:l7",
      "Контрочарование",
      "Если вы или существо в пределах 30 футов проваливает спасбросок против Очарования или Испуга, реакцией заставьте цель перебросить спасбросок с преимуществом.",
      {
        kind: "failed_save_reroll",
        range_feet: 30,
        conditions: ["charmed", "frightened"],
        reroll_advantage: true,
        activation: "reaction",
        trigger_adjudication: "table",
      },
    ),
    {
      id: "bard-countercharm-action-l7",
      type: "action",
      sourceKey: "countercharm",
      key: "countercharm",
      label: "Контрочарование",
      economy: "reaction",
      range: { kind: "area", shape: "emanation", size: 30, unit: "feet" },
      effects: [{
        kind: "semantic",
        key: "reroll_failed_save_with_advantage",
        payload: {
          target: "self_or_creature",
          failed_save_applies_condition: ["charmed", "frightened"],
          advantage: true,
        },
      }],
      tags: ["class", "bard", "countercharm", "failed-save", "table-adjudicated"],
    },
  )

  levels[18]!.mechanics.push(feature(
    "bard-epic-boon-l19",
    "epic-boon",
    "class:bard:epic-boon:l19",
    "Эпический дар",
    "Получите талант категории «Эпический дар» либо другой талант, требованиям которого соответствуете.",
    {
      kind: "feat_choice",
      choice_count: 1,
      source_level: 19,
      allowed: "epic_boon_or_qualified_feat",
      runtime_owner: "generic_feat_source_pending",
    },
  ))

  levels[19]!.mechanics.push(
    feature(
      "bard-words-feature-l20",
      "words-of-creation",
      "class:bard:words-of-creation:l20",
      "Слова созидания",
      "Слово силы: Исцеление и Слово силы: Смерть всегда подготовлены; при их сотворении можно выбрать вторую цель в пределах 10 футов от первой.",
      {
        kind: "spell_second_target_option",
        spell_keys: ["spell:power-word-heal", "spell:power-word-kill"],
        second_target_within_feet_of_first: 10,
        target_adjudication: "table",
      },
    ),
    wordsSpell("power-word-heal", "Слово силы: Исцеление"),
    wordsSpell("power-word-kill", "Слово силы: Смерть"),
  )

  return {
    assignment: {
      id: "bard-stage4-assignment",
      character_id: "bard-stage4-character",
      template_id: "bard-stage4-template",
      template_level: level,
      selected_choices: {
        "bard-skills": ["skill:performance", "skill:persuasion", "skill:deception"],
        ...(expertise.length ? { bard_expertise: expertise } : {}),
      },
      assigned_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    template: {
      id: "bard-stage4-template",
      campaign_id: "campaign",
      kind: "class",
      slug: "bard-core",
      name: "Бард",
      description: "Бард 2024 с базовым runtime Stage 4.",
      version: 1,
      mechanics: [],
      choices: [],
      catalog_key: "class:bard",
      catalog_revision: "xphb-2024-bard-stage4-base-runtime-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Бард с Экспертизой, Мастером на все руки, Контрочарованием и Словами созидания.",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    levels,
  }
}

function input(level: number, expertise: string[] = []): CharacterEngineInput {
  const bundle = bardBundle(level, expertise)
  const parsed = resolveTemplateBundles([bundle], level)
  return {
    base: {
      id: "bard-stage4-character",
      name: "Бард",
      level,
      abilities: {
        strength: 10,
        dexterity: 16,
        constitution: 14,
        intelligence: 12,
        wisdom: 10,
        charisma: 18,
      },
      baseMaxHp: 80,
      baseSpeed: 30,
      skillProficiencies: { arcana: 1 },
    },
    state: {
      currentHp: 80,
      tempHp: 0,
      resources: {
        spell_slot_9: { current: 1 },
      },
    },
    contributions: parsed.contributions,
  }
}

test("Bard Stage 4 declares strict package/resource gates", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE: mechanics/)
  assert.match(migration, /CLASS_INTEGRATION_STRICT: class:bard/)
  assert.match(migration, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
  assert.match(migration, /CLASS_PACKAGE_TEST: tests\/bardBaseRuntimeStage4\.test\.ts/)
  assert.match(migration, /xphb-2024-bard-stage4-base-runtime-v1/)
})

test("Stage 4 fixture passes package quality and resource policy", () => {
  const bundle = bardBundle(20, ["skill:performance", "skill:persuasion", "skill:deception", "skill:arcana"])
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))
})

test("generic dynamic provider exposes only owned rank-1 skills for new Expertise picks", () => {
  const bundle = bardBundle(2)
  const state = resolveTemplateChoiceStates(
    [bundle],
    2,
    { skillProficiencies: { arcana: 1, athletics: 2 } },
  ).find((entry) => entry.key === "bard_expertise")
  assert.ok(state)

  const available = new Set(state.options.filter((option) => option.available).map((option) => option.key))
  assert.ok(available.has("skill:arcana"))
  assert.ok(available.has("skill:performance"))
  assert.ok(available.has("skill:persuasion"))
  assert.ok(available.has("skill:deception"))
  assert.equal(available.has("skill:athletics"), false)
  assert.equal(available.has("skill:history"), false)
})

test("Expertise reaches rank 2 and ordinary class choice proficiencies resolve across variants", () => {
  const contract = resolveCharacterContract(input(2, ["skill:performance", "skill:persuasion"]))
  assert.equal(contract.skills.performance.proficiencyRank, 2)
  assert.equal(contract.skills.persuasion.proficiencyRank, 2)
  assert.equal(contract.skills.deception.proficiencyRank, 1)
})

test("Jack of All Trades applies half PB only to untrained skill checks", () => {
  const contract = resolveCharacterContract(input(9, [
    "skill:performance",
    "skill:persuasion",
    "skill:deception",
    "skill:arcana",
  ]))
  assert.equal(contract.proficiencyBonus.value, 4)
  assert.equal(contract.skills.history.proficiencyRank, 0)
  assert.equal(contract.skills.history.bonus.value, 3) // INT +1 + half PB +2
  assert.equal(contract.skills.deception.proficiencyRank, 2)
  assert.equal(contract.skills.deception.bonus.value, 12) // CHA +4 + double PB +8
  assert.equal(contract.combat.initiative.value, 3) // DEX only; Jack never touches initiative
})

test("Countercharm resolves as an exact reaction without fake scene state", () => {
  const contract = resolveCharacterContract(input(7))
  const action = contract.actions.find((entry) => entry.key === "countercharm")
  assert.ok(action)
  assert.equal(action.economy, "reaction")
  assert.equal(action.range?.kind, "area")
  if (action.range?.kind === "area") assert.equal(action.range.size, 30)
  assert.equal(action.effects[0]?.kind, "semantic")
  if (action.effects[0]?.kind === "semantic") {
    assert.equal(action.effects[0].key, "reroll_failed_save_with_advantage")
  }
  assert.ok(action.tags.includes("table-adjudicated"))
})

test("Words of Creation grants both spells always prepared and keeps shared slot spending", () => {
  const engine = input(20, ["skill:performance", "skill:persuasion", "skill:deception", "skill:arcana"])
  const contract = resolveCharacterContract(engine)
  for (const key of ["spell:power-word-heal", "spell:power-word-kill"]) {
    const spell = contract.spells.find((entry) => entry.key === key)
    assert.ok(spell)
    assert.equal(spell.accesses[0]?.preparationMode, "always_prepared")
    assert.equal(spell.accesses[0]?.methods[0]?.ability, "charisma")
  }

  const heal = contract.spells.find((entry) => entry.key === "spell:power-word-heal")
  const slot = heal?.accesses[0]?.methods[0]?.resourceOptions.find((entry) => entry.key === "slot-9")
  assert.ok(slot)
  const next = applySpellResourceOption(engine.state, slot)
  assert.equal(next.resources?.spell_slot_9?.current, 0)

  const rule = contract.rules.find((entry) => entry.key === "class:bard:words-of-creation:l20")
  assert.ok(rule)
  assert.equal(rule.integration, "structured")
  assert.equal((rule.mechanic as Record<string, unknown>).second_target_within_feet_of_first, 10)
})

test("ASI and Epic Boon remain generic feat hooks, never a Bard-specific picker", () => {
  assert.match(migration, /'runtime_owner','generic_feat_source_pending'/)
  assert.match(migration, /'feat_source_runtime_present',false/)
  assert.match(migration, /Bard-specific picker/)
  assert.doesNotMatch(migration, /bard_feat_choice|bard_asi_choice|bard_epic_boon_choice/)
})

test("server dynamic provider validates only newly added Expertise skills", () => {
  assert.match(migration, /character_skill_proficiency_rank_for_choice_v1/)
  assert.match(migration, /validate_choice_option_provider_v1/)
  assert.match(migration, /v_already_stored/)
  assert.match(migration, /CHOICE_PROVIDER_SKILL_PROFICIENCY_INELIGIBLE/)
  assert.match(migration, /commit_character_template_choice_v2_core_stage4_provider_base_v1/)
})

test("new campaigns install Stage 4 instead of stopping at Stage 3", () => {
  assert.match(migration, /perform private\.ensure_bard_spell_runtime_stage3_v1\(p_campaign_id\)/)
  assert.match(migration, /drop trigger if exists aaaaaaaai_campaigns_ensure_bard_spell_runtime_stage3_v1/)
  assert.match(migration, /create trigger aaaaaaaaj_campaigns_ensure_bard_base_runtime_stage4_v1/)
})
