import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertPersistentResourceRecharge } from "../src/lib/persistentResourcePolicy.ts"
import { resolveTemplateChoiceStates } from "../src/rule-templates/choiceState.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260921153000_rogue_stage6_legacy_subclasses_v1.sql",
  "utf8",
)

function template(
  id: string,
  kind: "class" | "subclass",
  catalogKey: string,
  name: string,
  parent: string | null,
  summary: string,
) {
  return {
    id,
    campaign_id: "campaign",
    kind,
    slug: catalogKey.replaceAll(":", "-"),
    name,
    description: summary,
    version: 1,
    mechanics: [],
    choices: [],
    parent_template_id: parent,
    unlock_level: kind === "subclass" ? 3 : null,
    catalog_key: catalogKey,
    catalog_revision:
      kind === "class"
        ? "xphb-2024-rogue-stage4-base-runtime-v1"
        : "rogue-stage6-legacy-subclasses-v1",
    source_kind: "official" as const,
    source_label: "Legacy supplement",
    is_builtin: true,
    mechanical_summary: summary,
    author_description: "",
    author_comment: "",
    rules_meta: {},
    is_active: true,
    created_by: null,
    created_at: "2026-09-21T00:00:00Z",
    updated_at: "2026-09-21T00:00:00Z",
  }
}

function feature(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  description: string,
  mechanic: Record<string, unknown>,
): StoredMechanic {
  return {
    id,
    type: "grant",
    sourceKey,
    target: "feature",
    key,
    payload: { label, description, mechanic },
  }
}

function parentBundle(level = 20): CharacterTemplateBundle {
  return {
    assignment: {
      id: "rogue-parent-assignment",
      character_id: "rogue-stage6-character",
      template_id: "rogue-parent",
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    template: template(
      "rogue-parent",
      "class",
      "class:rogue",
      "Разбойник",
      null,
      "Базовый Разбойник 2024 с сертифицированной прогрессией 1–20, Скрытой атакой, Хитрым ударом и общими ресурсами класса.",
    ),
    levels: [],
  }
}

function subclassBundle(
  id: string,
  catalogKey: string,
  name: string,
  summary: string,
  mechanics: StoredMechanic[],
  choices: CharacterTemplateBundle["levels"][number]["choices"] = [],
  level = 3,
): CharacterTemplateBundle {
  return {
    assignment: {
      id: `${id}-assignment`,
      character_id: "rogue-stage6-character",
      template_id: id,
      template_level: 20,
      selected_choices: {},
      assigned_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    template: template(id, "subclass", catalogKey, name, "rogue-parent", summary),
    levels: [{
      id: `${id}-l${level}`,
      template_id: id,
      level,
      mechanics,
      choices,
    }],
  }
}

test("Stage 6 migration contains exactly the five frozen legacy/supplement packages and certifies nine total Rogue subclasses", () => {
  for (const key of [
    "subclass:rogue:swashbuckler",
    "subclass:rogue:inquisitive",
    "subclass:rogue:mastermind",
    "subclass:rogue:scout",
    "subclass:rogue:phantom",
  ]) {
    assert.ok(migration.includes(key), key)
  }
  assert.match(migration, /ROGUE_STAGE6_ROSTER/)
  assert.match(migration, /supported_subclass_count',9/)
  assert.match(migration, /stage6_legacy_subclass_count',5/)
  assert.doesNotMatch(migration, /mechanics_status','READY'/)
})

test("Stage 6 preserves the locked legacy rule corrections instead of modernizing them", () => {
  assert.match(migration, /'inventedInsightDetector',false/)
  assert.match(migration, /'attackMayTargetAnyLegalTarget',true/)
  assert.match(migration, /'secondSneakAttackMustUseDifferentTarget',true/)
  assert.match(migration, /'persistentTurnTracker',false/)
  assert.match(migration, /'undeadConstructExcluded',false/)
  assert.match(migration, /'truthRequired',false/)
  assert.match(migration, /'initiativeCreatesTrinket',false/)
  assert.match(migration, /'restore','ensure_minimum','amount',1/)
})

test("Phantom Wails uses ceil-half Sneak Attack dice progression", () => {
  for (const [level, dice] of [[3,1],[5,2],[9,3],[13,4],[17,5]] as const) {
    const pattern = new RegExp(
      `phantom-wails-action-l${level}[\\s\\S]*?'count',${dice},'sides',6`,
    )
    assert.match(migration, pattern)
  }
  assert.match(migration, /'diceCount','ceil\(sneak_attack_dice \/ 2\)'/)
})

test("generic persistent recovery accepts ensure_minimum and rejects negative values", () => {
  assert.doesNotThrow(() => assertPersistentResourceRecharge({
    rules: [{ trigger: "long_rest", restore: "ensure_minimum", amount: 1 }],
  }))
  assert.throws(() => assertPersistentResourceRecharge({
    rules: [{ trigger: "long_rest", restore: "ensure_minimum", amount: -1 }],
  } as never))
})

test("Phantom refresh choice exposes only unowned skills/tools and inherits Rogue source level", () => {
  const phantom = subclassBundle(
    "phantom-choice",
    "subclass:rogue:phantom",
    "Фантом",
    "Фантом Tasha меняет одно отсутствующее владение после короткого или долгого отдыха и сохраняет выбор до следующей осознанной замены.",
    [feature(
      "phantom-whispers-feature",
      "whispers-of-the-dead",
      "subclass:rogue:phantom:whispers-of-the-dead",
      "Шепот мертвецов",
      "После короткого или долгого отдыха выберите один навык или инструмент, которым не владеете, и получите владение до следующей замены этой способности.",
      { kind: "refreshable_proficiency_choice" },
    )],
    [{
      key: "phantom_whispers_proficiency",
      label: "Шепот мертвецов",
      target: "proficiency",
      count: 1,
      selection_mode: "player_once",
      refresh: "short_or_long_rest",
      replacement_policy: "always",
      replacement_limit: 1,
      options: ["skill:stealth", "skill:arcana", "tool:thieves-tools", "tool:herbalism-kit"],
      option_labels: {
        "skill:stealth": "Скрытность",
        "skill:arcana": "Магия",
        "tool:thieves-tools": "Воровские инструменты",
        "tool:herbalism-kit": "Набор травника",
      },
      option_provider: { kind: "unproficient_skill_or_tool" },
    }],
  )
  const states = resolveTemplateChoiceStates(
    [parentBundle(8), phantom],
    20,
    {
      skillProficiencies: { stealth: 1 },
      toolProficiencies: ["tool:thieves-tools"],
    },
  )
  const state = states.find((entry) => entry.key === "phantom_whispers_proficiency")
  assert.ok(state)
  assert.equal(state.sourceLevel, 8)
  assert.equal(state.refresh, "short_or_long_rest")
  assert.equal(state.options.find((entry) => entry.key === "skill:stealth")?.available, false)
  assert.equal(state.options.find((entry) => entry.key === "tool:thieves-tools")?.available, false)
  assert.equal(state.options.find((entry) => entry.key === "skill:arcana")?.available, true)
  assert.equal(state.options.find((entry) => entry.key === "tool:herbalism-kit")?.available, true)
})

test("representative Stage 6 bundles pass shared quality/resource/parser/CE gates", () => {
  const swash = subclassBundle(
    "swash",
    "subclass:rogue:swashbuckler",
    "Сорвиголова",
    "Сорвиголова Xanathar усиливает инициативу Харизмой, безопасно выходит из дуэли и получает ограниченный переброс промаха с Преимуществом.",
    [
      feature(
        "master-duelist-feature",
        "master-duelist",
        "subclass:rogue:swashbuckler:master-duelist",
        "Мастерский выпад",
        "Когда вы промахиваетесь броском атаки, немедленно перебросьте эту атаку с Преимуществом; способность восстанавливается после короткого или долгого отдыха.",
        { kind: "attack_reroll_with_advantage" },
      ),
      {
        id: "master-duelist-resource",
        type: "resource",
        sourceKey: "master-duelist",
        key: "swashbuckler_master_duelist_use",
        label: "Мастерский выпад",
        max: 1,
        recharge: ["short_rest", "long_rest"],
        initial: "full",
      },
      {
        id: "master-duelist-action",
        type: "action",
        sourceKey: "master-duelist",
        key: "swashbuckler_master_duelist",
        label: "Мастерский выпад",
        economy: "triggered",
        range: { kind: "self" },
        resourceCosts: [{ key: "swashbuckler_master_duelist_use", amount: 1 }],
        effects: [{
          kind: "semantic",
          key: "reroll_attack_with_advantage",
          payload: { trigger: "attack_miss" },
        }],
        tags: ["rogue", "swashbuckler"],
      },
    ],
    [],
    17,
  )

  const phantom = subclassBundle(
    "phantom",
    "subclass:rogue:phantom",
    "Фантом",
    "Фантом Tasha хранит осколки душ как ограниченный ресурс, использует их для призрачной походки и получает один после долгого отдыха только при пустом запасе.",
    [
      feature(
        "ghost-walk-feature",
        "ghost-walk",
        "subclass:rogue:phantom:ghost-walk",
        "Призрачная походка",
        "Бонусным действием примите спектральную форму на 10 минут; одно бесплатное использование восстанавливается после долгого отдыха, либо вместо него уничтожьте один осколок души.",
        { kind: "spectral_form", duration: "10_minutes" },
      ),
      {
        id: "phantom-soul-trinkets",
        type: "resource",
        sourceKey: "tokens-of-the-departed",
        key: "phantom_soul_trinkets",
        label: "Осколки душ",
        max: 6,
        recharge: ["long_rest"],
        recoveryRules: [{
          trigger: "long_rest",
          restore: "ensure_minimum",
          amount: 1,
        }],
        initial: "empty",
      },
      {
        id: "ghost-walk-free",
        type: "resource",
        sourceKey: "ghost-walk",
        key: "phantom_ghost_walk_free",
        label: "Призрачная походка",
        max: 1,
        recharge: ["long_rest"],
        initial: "full",
      },
      {
        id: "ghost-walk-action",
        type: "action",
        sourceKey: "ghost-walk",
        key: "phantom_ghost_walk",
        label: "Призрачная походка",
        economy: "bonus_action",
        range: { kind: "self" },
        costOptions: [
          { key: "free", costs: [{ key: "phantom_ghost_walk_free", amount: 1 }] },
          { key: "trinket", costs: [{ key: "phantom_soul_trinkets", amount: 1 }] },
        ],
        effects: [{
          kind: "semantic",
          key: "spectral_form",
          payload: { duration: "10_minutes" },
        }],
        tags: ["rogue", "phantom"],
      },
    ],
    [],
    13,
  )

  const bundles = [parentBundle(), swash, phantom]
  assert.doesNotThrow(() => assertClassPackageQuality(bundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(bundles))

  const parsed = resolveTemplateBundles(bundles, 20)
  const contract = resolveCharacterContract({
    base: {
      id: "rogue-stage6-character",
      name: "Разбойник",
      level: 20,
      abilities: {
        strength: 10,
        dexterity: 18,
        constitution: 14,
        intelligence: 12,
        wisdom: 14,
        charisma: 16,
      },
      baseMaxHp: 100,
      baseSpeed: 30,
    },
    state: {
      currentHp: 100,
      tempHp: 0,
      resources: {
        swashbuckler_master_duelist_use: { current: 1 },
        phantom_soul_trinkets: { current: 2 },
        phantom_ghost_walk_free: { current: 1 },
      },
    },
    contributions: parsed.contributions,
  })

  assert.ok(contract.actions.some((action) => action.key === "swashbuckler_master_duelist"))
  assert.ok(contract.actions.some((action) => action.key === "phantom_ghost_walk"))
  assert.equal(
    contract.resources.find((resource) => resource.stateKey === "phantom_soul_trinkets")?.current,
    2,
  )
})

test("Stage 6 does not activate unsupported Rogue subclasses or invent a tenth package", () => {
  assert.match(migration, /ROGUE_STAGE6_UNSUPPORTED_SUBCLASS_ACTIVE/)
  assert.doesNotMatch(migration, /subclass:rogue:scion-of-the-three[^\n]*is_active=true/i)
})
