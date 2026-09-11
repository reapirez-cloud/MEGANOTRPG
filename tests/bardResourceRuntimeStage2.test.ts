import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  applyResourceRecovery,
  executeAction,
  resolveCharacterContract,
  type CharacterContribution,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import { bardReferenceCurrent } from "../src/data/classes/bardReferenceCurrent.ts"
import { resourceSyncInputs } from "../src/lib/resourceRuntime.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const migrationPath = "supabase/migrations/20260911073000_bard_stage2_inspiration_runtime.sql"
const migration = fs.readFileSync(migrationPath, "utf8")
const closureMigrationPath = "supabase/migrations/20260911074000_bard_stage2_superior_inspiration_v2.sql"
const closureMigration = fs.readFileSync(closureMigrationPath, "utf8")

const inspirationMax = {
  kind: "max" as const,
  values: [
    { kind: "literal" as const, value: 1 },
    { kind: "reference" as const, key: "abilities.charisma.modifier" },
  ],
}

function feature(id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic {
  return { id, type: "grant", target: "feature", key, sourceKey, payload: { label, description } }
}

function inspirationDie(level: number, sides: number): StoredMechanic {
  return {
    id: `bard-inspiration-die-l${level}`,
    type: "grant",
    sourceKey: "bardic-inspiration",
    target: "value",
    key: "bardic_inspiration_die_sides",
    grantOperation: "REPLACE",
    priority: level,
    payload: { label: "Кость Вдохновения барда", value: sides },
  }
}

function inspirationResource(level: number, shortRest: boolean): StoredMechanic {
  return {
    id: `bard-inspiration-resource-l${level}`,
    type: "resource",
    sourceKey: "bardic-inspiration",
    key: "bardic_inspiration",
    label: "Вдохновение барда",
    max: inspirationMax,
    recharge: shortRest ? ["short_rest", "long_rest"] : ["long_rest"],
    initial: "full",
    ...(level > 1 ? { grantOperation: "REPLACE" as const, priority: level } : {}),
  }
}

const fontOptions = Array.from({ length: 9 }, (_, index) => {
  const level = index + 1
  return {
    key: `slot-${level}`,
    label: `Ячейка ${level} уровня`,
    costs: [{ key: `spell_slot_${level}`, amount: 1 }],
  }
})

const levelMechanics: Record<number, StoredMechanics> = {
  1: [
    feature(
      "bard-bardic-inspiration-feature-l1",
      "bardic-inspiration",
      "class:bard:bardic-inspiration:l1",
      "Вдохновение барда",
      "Бонусным действием выберите другое существо в пределах 60 футов, которое видит или слышит вас. Оно получает одну кость Вдохновения барда на 1 час; одновременно у существа может быть только одна такая кость. После провала D20-теста существо может бросить кость и прибавить результат, после чего кость расходуется. Число применений равно модификатору Харизмы, минимум 1; все потраченные применения возвращаются после долгого отдыха. Кость равна к6, становится к8 на 5-м, к10 на 10-м и к12 на 15-м уровне барда.",
    ),
    inspirationResource(1, false),
    inspirationDie(1, 6),
    {
      id: "bard-inspiration-grant-action-l1",
      type: "action",
      sourceKey: "bardic-inspiration",
      key: "bardic_inspiration_grant",
      label: "Дать Вдохновение барда",
      economy: "bonus_action",
      range: { kind: "ranged", normal: 60, unit: "feet" },
      resourceCosts: [{ key: "bardic_inspiration", amount: 1 }],
      effects: [{
        kind: "semantic",
        key: "grant_bardic_inspiration_die",
        payload: {
          target: "other_creature",
          duration_minutes: 60,
          die_value_key: "bardic_inspiration_die_sides",
          target_state_persistence: "gm_adjudicated",
        },
      }],
      tags: ["class", "bard", "bardic-inspiration", "target-effect-gm-adjudicated"],
    },
  ],
  5: [
    feature(
      "bard-font-of-inspiration-feature-l5",
      "font-of-inspiration",
      "class:bard:font-of-inspiration:l5",
      "Источник вдохновения",
      "Все потраченные применения Вдохновения барда теперь возвращаются после короткого или долгого отдыха. Кроме того, вы можете без действия потратить одну ячейку заклинаний любого уровня, чтобы вернуть одно потраченное применение Вдохновения барда.",
    ),
    {
      id: "bard-font-of-inspiration-action-l5",
      type: "action",
      sourceKey: "font-of-inspiration",
      key: "font_of_inspiration_restore",
      label: "Источник вдохновения: вернуть применение",
      economy: "special",
      costOptions: fontOptions,
      effects: [{ kind: "resource", key: "bardic_inspiration", operation: "RESTORE", amount: 1 }],
      tags: ["class", "bard", "font-of-inspiration", "no-action", "shared-spell-slot-ledger"],
    },
    inspirationResource(5, true),
    inspirationDie(5, 8),
  ],
  10: [inspirationDie(10, 10)],
  15: [inspirationDie(15, 12)],
  18: [
    feature(
      "bard-superior-inspiration-feature-l18",
      "superior-inspiration",
      "class:bard:superior-inspiration:l18",
      "Превосходное вдохновение",
      "Когда вы бросаете инициативу и у вас меньше двух доступных применений Вдохновения барда, вы возвращаете потраченные применения, пока доступных применений не станет два. Текущее приложение не владеет событием инициативы, поэтому применение подтверждается за столом.",
    ),
    {
      id: "bard-superior-inspiration-action-l18",
      type: "action",
      sourceKey: "superior-inspiration",
      key: "superior_inspiration",
      label: "Превосходное вдохновение",
      economy: "free",
      range: { kind: "self" },
      requirements: [
        {
          kind: "resource",
          key: "bardic_inspiration",
          minimum: 0,
          maximum: 1,
          enforcement: "engine",
          label: "Доступно только если применений Вдохновения барда меньше двух",
        },
      ],
      effects: [{ kind: "resource", key: "bardic_inspiration", operation: "ENSURE_MINIMUM", amount: 2 }],
      tags: ["class", "bard", "initiative-trigger", "table-adjudicated"],
    },
  ],
}

function bundleAt(level: number): CharacterTemplateBundle {
  return {
    assignment: {
      id: "bard-stage2-assignment",
      character_id: "bard-stage2-character",
      template_id: "class-bard-stage2",
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    template: {
      id: "class-bard-stage2",
      campaign_id: "campaign",
      kind: "class",
      slug: "bard-core",
      name: "Бард",
      description: "Бард 2024 с реальным запасом Вдохновения барда.",
      version: 1,
      mechanics: [],
      choices: [],
      catalog_key: "class:bard",
      catalog_revision: "xphb-2024-bard-stage2-inspiration-v2",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Бард использует Харизму и канонический восстанавливаемый запас Вдохновения барда; размер кости растёт с уровнем, а Источник вдохновения использует общий ledger ячеек.",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    levels: Array.from({ length: 20 }, (_, index) => {
      const sourceLevel = index + 1
      return {
        id: `bard-stage2-level-${sourceLevel}`,
        template_id: "class-bard-stage2",
        level: sourceLevel,
        mechanics: levelMechanics[sourceLevel] ?? [],
        choices: [],
      }
    }),
  }
}

function spellSlotContribution(level: number, max: number): CharacterContribution {
  return {
    id: `test-slot-${level}`,
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: `spell_slot_${level}`,
    payload: {
      max,
      label: `Ячейки ${level} уровня`,
      initial: "full",
      recharge: { triggers: ["long_rest"], restore: "full" },
    },
    source: {
      id: `test:slot:${level}`,
      name: "Test shared spell slots",
      sourceType: "test",
      visibility: "private",
    },
  }
}

function inputAt(
  level: number,
  charisma: number,
  resources: NonNullable<CharacterEngineInput["state"]["resources"]> = {},
  extra: CharacterContribution[] = [],
): CharacterEngineInput {
  const parsed = resolveTemplateBundles([bundleAt(level)], level)
  return {
    base: {
      id: "bard-stage2-character",
      name: "Бард",
      level,
      abilities: {
        strength: 8,
        dexterity: 16,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma,
      },
      baseMaxHp: 60,
      baseSpeed: 30,
    },
    state: { currentHp: 60, tempHp: 0, resources },
    contributions: [...parsed.contributions, ...extra],
  }
}

test("Bard Stage 2 declares strict class/resource gates and remains pre-spell-runtime", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE: mechanics/)
  assert.match(migration, /CLASS_INTEGRATION_STRICT: class:bard/)
  assert.match(migration, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
  assert.match(migration, /CLASS_PACKAGE_TEST: tests\/bardResourceRuntimeStage2\.test\.ts/)
  assert.match(closureMigration, /CLASS_MIGRATION_SCOPE: mechanics/)
  assert.match(closureMigration, /CLASS_INTEGRATION_STRICT: class:bard/)
  assert.match(closureMigration, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
  assert.match(closureMigration, /CLASS_PACKAGE_TEST: tests\/bardResourceRuntimeStage2\.test\.ts/)
  assert.match(closureMigration, /'spell_runtime_included',false/)
  assert.match(closureMigration, /'sheet_profile_deferred',true/)
  assert.doesNotMatch(closureMigration, /'sheet_profile'\s*,/)
  assert.equal(bardReferenceCurrent.referenceOnly, true)
})

test("Bard Stage 2 package passes shared quality and persistent-resource policy", () => {
  const bundle = bundleAt(20)
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))
})

test("Bardic Inspiration maximum follows Charisma modifier with minimum one", () => {
  const lowCharisma = resolveCharacterContract(inputAt(1, 8))
  assert.equal(lowCharisma.resources.find((entry) => entry.key === "bardic_inspiration")?.max.value, 1)

  const normal = resolveCharacterContract(inputAt(1, 18))
  assert.equal(normal.resources.find((entry) => entry.key === "bardic_inspiration")?.max.value, 4)
})

test("Bardic Inspiration die and recharge follow Bard class level", () => {
  const expected = [
    [1, 6, ["long_rest"]],
    [4, 6, ["long_rest"]],
    [5, 8, ["short_rest", "long_rest"]],
    [10, 10, ["short_rest", "long_rest"]],
    [15, 12, ["short_rest", "long_rest"]],
  ] as const

  for (const [level, die, triggers] of expected) {
    const contract = resolveCharacterContract(inputAt(level, 18))
    assert.equal(
      contract.values.find((entry) => entry.key === "bardic_inspiration_die_sides")?.value.value,
      die,
    )
    assert.deepEqual(
      contract.resources.find((entry) => entry.key === "bardic_inspiration")?.recharge.triggers,
      [...triggers],
    )
  }
})

test("granting Bardic Inspiration spends the canonical actor pool", () => {
  const input = inputAt(1, 18, { bardic_inspiration: { current: 4 } })
  const contract = resolveCharacterContract(input)
  const action = contract.actions.find((entry) => entry.key === "bardic_inspiration_grant")
  assert.ok(action)
  assert.equal(action.resourceCosts[0]?.stateKey, "bardic_inspiration")
  assert.equal(action.effects[0]?.kind, "semantic")

  const next = executeAction(input.state, action)
  assert.equal(next.resources?.bardic_inspiration?.current, 3)
})

test("Font of Inspiration spends one shared spell slot and restores one Inspiration use", () => {
  const input = inputAt(
    5,
    18,
    {
      bardic_inspiration: { current: 2 },
      spell_slot_3: { current: 1 },
    },
    [spellSlotContribution(3, 2)],
  )
  const contract = resolveCharacterContract(input)
  const action = contract.actions.find((entry) => entry.key === "font_of_inspiration_restore")
  assert.ok(action)
  assert.equal(action.costOptions.length, 9)
  assert.equal(action.costOptions.find((entry) => entry.key === "slot-3")?.available, true)

  const next = executeAction(input.state, action, "slot-3")
  assert.equal(next.resources?.spell_slot_3?.current, 0)
  assert.equal(next.resources?.bardic_inspiration?.current, 3)
})

test("Font is unavailable before a canonical shared spell-slot resource exists", () => {
  const contract = resolveCharacterContract(inputAt(5, 18, { bardic_inspiration: { current: 2 } }))
  const action = contract.actions.find((entry) => entry.key === "font_of_inspiration_restore")
  assert.ok(action)
  assert.equal(action.available, false)
  assert.ok(action.costOptions.every((entry) => entry.available === false))
})

test("Superior Inspiration guarantees two uses without inventing initiative state", () => {
  const input = inputAt(18, 18, { bardic_inspiration: { current: 0 } })
  const contract = resolveCharacterContract(input)
  const action = contract.actions.find((entry) => entry.key === "superior_inspiration")
  assert.ok(action)
  assert.ok(action.tags.includes("initiative-trigger"))
  assert.ok(action.tags.includes("table-adjudicated"))
  assert.equal(action.requirements[0]?.enforcement, "engine")
  assert.equal(action.requirements[0]?.satisfied, true)
  assert.equal(action.effects[0]?.kind, "resource")
  assert.equal(action.effects[0]?.operation, "ENSURE_MINIMUM")
  assert.match(
    String(contract.capabilities.features.find((entry) => entry.key === "class:bard:superior-inspiration:l18")?.payload && JSON.stringify(contract.capabilities.features.find((entry) => entry.key === "class:bard:superior-inspiration:l18")?.payload)),
    /инициатив/i,
  )

  const next = executeAction(input.state, action)
  assert.equal(next.resources?.bardic_inspiration?.current, 2)
  assert.equal(next.resources?.bardic_inspiration?.temporaryMaxBonus ?? 0, 0)

  const lowCharismaInput = inputAt(18, 12, { bardic_inspiration: { current: 0 } })
  const lowCharismaContract = resolveCharacterContract(lowCharismaInput)
  const lowCharismaAction = lowCharismaContract.actions.find((entry) => entry.key === "superior_inspiration")
  assert.ok(lowCharismaAction)
  assert.equal(lowCharismaContract.resources.find((entry) => entry.key === "bardic_inspiration")?.max.value, 1)

  const lowCharismaNext = executeAction(lowCharismaInput.state, lowCharismaAction)
  assert.equal(lowCharismaNext.resources?.bardic_inspiration?.current, 2)
  assert.equal(lowCharismaNext.resources?.bardic_inspiration?.temporaryMaxBonus, 1)

  const lowCharismaResolved = resolveCharacterContract({
    ...lowCharismaInput,
    state: lowCharismaNext,
  })
  const lowCharismaResource = lowCharismaResolved.resources.find((entry) => entry.key === "bardic_inspiration")
  assert.ok(lowCharismaResource)
  assert.equal(lowCharismaResource.max.value, 2)
  assert.equal(lowCharismaResource.current, 2)
  assert.equal(lowCharismaResource.temporaryMaxBonus, 1)
  assert.equal(resourceSyncInputs(lowCharismaResolved)[0]?.max, 1)

  const afterLongRest = applyResourceRecovery(
    lowCharismaNext,
    lowCharismaResolved.resources,
    "long_rest",
  )
  assert.equal(afterLongRest.resources?.bardic_inspiration?.current, 1)
  assert.equal(afterLongRest.resources?.bardic_inspiration?.temporaryMaxBonus, 0)

  const alreadyAboveThreshold = resolveCharacterContract(
    inputAt(18, 18, { bardic_inspiration: { current: 3 } }),
  ).actions.find((entry) => entry.key === "superior_inspiration")
  assert.ok(alreadyAboveThreshold)
  assert.equal(alreadyAboveThreshold.available, false)

  assert.match(closureMigration, /'operation','ENSURE_MINIMUM'/)
  assert.match(closureMigration, /xphb-2024-bard-stage2-inspiration-v2/)
  assert.doesNotMatch(closureMigration, /initiative_confirmed|initiative_available|turn_state/)
})

test("Stage 2 persistence follows assignment, Bard level and Charisma without creating another ledger", () => {
  assert.match(migration, /character_template_assignments_sync_bard_resources_stage2_v1/)
  assert.match(migration, /character_sheets_sync_bard_resources_stage2_v1/)
  assert.match(migration, /after insert or update of charisma/)
  assert.match(migration, /private\.evaluate_character_template_numeric_expression/)
  assert.match(closureMigration, /temporary_max_bonus/)
  assert.match(closureMigration, /excluded\.max_snapshot>=2/)
  assert.match(closureMigration, /public\.character_resource_states\.max_snapshot[\s\S]*public\.character_resource_states\.current/)
  assert.match(closureMigration, /state_key='bardic_inspiration'/)
  assert.doesNotMatch(closureMigration, /create table[\s\S]*bard/i)
})

test("new campaigns install the final Stage 2 v2 package instead of stopping at v1", () => {
  assert.match(closureMigration, /perform private\.ensure_bard_resource_runtime_stage2_v1\(p_campaign_id\)/)
  assert.match(closureMigration, /drop trigger if exists aaaaaaaag_campaigns_ensure_bard_resource_runtime_stage2_v1/)
  assert.match(closureMigration, /create trigger aaaaaaaah_campaigns_ensure_bard_stage2_superior_inspiration_v2/)
  assert.match(closureMigration, /private\.ensure_bard_stage2_superior_inspiration_v2\(new\.id\)/)
})
