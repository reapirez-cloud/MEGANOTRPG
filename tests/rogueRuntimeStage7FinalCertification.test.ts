import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { classReference } from "../src/data/classReferenceCatalog.ts"
import { rogueReferenceCurrent } from "../src/data/classes/rogueReferenceCurrent.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260921160000_rogue_stage7_final_certification_v1.sql",
  "utf8",
)
const classPresentation = fs.readFileSync(
  "src/rule-templates/classPresentation.ts",
  "utf8",
)
const chatPanel = fs.readFileSync(
  "src/ui-v1-isolated/chat-room/ChatActionPanel.tsx",
  "utf8",
)
const chatHost = fs.readFileSync(
  "src/ui-v1-isolated/chat-room/ChatActionHost.tsx",
  "utf8",
)

const supportedSubclassIds = [
  "thief",
  "assassin",
  "arcane-trickster",
  "soulknife",
  "swashbuckler",
  "inquisitive",
  "mastermind",
  "scout",
  "phantom",
]

function stage7RepresentativeBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "rogue-stage7-assignment",
      character_id: "rogue-stage7-character",
      template_id: "rogue-stage7-template",
      template_level: 20,
      selected_choices: {},
      assigned_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    template: {
      id: "rogue-stage7-template",
      campaign_id: "campaign",
      kind: "class",
      slug: "rogue-core",
      name: "Разбойник",
      description:
        "Сертифицированный Разбойник 2024 использует общие CE-правила, ресурсы и исполнительный контур.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:rogue",
      catalog_revision: "xphb-2024-rogue-runtime-final-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary:
        "Полный базовый runtime Разбойника 1–20 и девять поддерживаемых подклассов сертифицированы общими Character Engine, Choice Runtime и GENA.",
      author_description: "",
      author_comment: "",
      rules_meta: { mechanics_status: "READY", runtime_status: "ready" },
      is_active: true,
      created_by: null,
      created_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    levels: [{
      id: "rogue-stage7-l20",
      template_id: "rogue-stage7-template",
      level: 20,
      mechanics: [
        {
          id: "rogue-stage7-stroke-feature",
          type: "grant",
          sourceKey: "stroke-of-luck",
          target: "feature",
          key: "class:rogue:stroke-of-luck:l20",
          payload: {
            label: "Мастерский удар",
            description:
              "После проваленного D20 Test превратите результат d20 в 20. Одно использование восстанавливается после короткого или долгого отдыха.",
            mechanic: {
              kind: "d20_result_override",
              result: 20,
              trigger: "failed_d20_test",
            },
          },
        },
        {
          id: "rogue-stage7-stroke-resource",
          type: "resource",
          sourceKey: "stroke-of-luck",
          key: "rogue_stroke_of_luck",
          label: "Мастерский удар",
          max: 1,
          recharge: ["short_rest", "long_rest"],
          initial: "full",
        },
        {
          id: "rogue-stage7-stroke-action",
          type: "action",
          sourceKey: "stroke-of-luck",
          key: "rogue_stroke_of_luck_override",
          label: "Мастерский удар: результат 20",
          economy: "triggered",
          range: { kind: "self" },
          resourceCosts: [{ key: "rogue_stroke_of_luck", amount: 1 }],
          effects: [{
            kind: "semantic",
            key: "d20_result_override",
            payload: { result: 20, trigger: "failed_d20_test" },
          }],
          tags: ["rogue", "d20"],
        },
      ],
      choices: [],
    }],
  }
}

test("Stage 7 representative READY package still passes the shared quality/resource/parser/CE gates", () => {
  const bundle = stage7RepresentativeBundle()
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))

  const parsed = resolveTemplateBundles([bundle], 20)
  const contract = resolveCharacterContract({
    base: {
      id: "rogue-stage7-character",
      name: "Разбойник",
      level: 20,
      abilities: {
        strength: 10,
        dexterity: 20,
        constitution: 14,
        intelligence: 14,
        wisdom: 12,
        charisma: 10,
      },
      baseMaxHp: 120,
      baseSpeed: 30,
    },
    state: {
      currentHp: 120,
      tempHp: 0,
      resources: { rogue_stroke_of_luck: { current: 1 } },
    },
    contributions: parsed.contributions,
  })

  assert.ok(
    contract.resources.some(
      (resource) => resource.stateKey === "rogue_stroke_of_luck",
    ),
  )
  assert.ok(
    contract.actions.some(
      (action) => action.key === "rogue_stroke_of_luck_override",
    ),
  )
})

test("Stage 7 public Rogue reference is runtime-backed with the exact supported 9-subclass roster", () => {
  assert.equal(rogueReferenceCurrent.referenceOnly, false)
  assert.deepEqual(
    rogueReferenceCurrent.subclasses.map((entry) => entry.id),
    supportedSubclassIds,
  )
  assert.ok(
    rogueReferenceCurrent.subclasses.every(
      (entry) => entry.referenceOnly === false,
    ),
  )
  assert.match(rogueReferenceCurrent.description, /Character Engine/)
  assert.doesNotMatch(rogueReferenceCurrent.description, /пока не подключены/i)
  assert.doesNotMatch(rogueReferenceCurrent.mechanics || "", /Reference-only/i)
})

test("player-facing class catalog now exposes the same certified Rogue reference", () => {
  const rogue = classReference.find((entry) => entry.id === "rogue")
  assert.ok(rogue)
  assert.equal(rogue.referenceOnly, false)
  assert.deepEqual(
    rogue.subclasses.map((entry) => entry.id),
    supportedSubclassIds,
  )
})

test("Stage 7 certification is fail-closed before writing READY", () => {
  for (const marker of [
    "ROGUE_FINAL_ACTIVE_CLASS_COUNT",
    "ROGUE_FINAL_LEVEL_ROWS_INVALID",
    "ROGUE_FINAL_STAGE_STACK_INCOMPLETE",
    "ROGUE_FINAL_SUPPORTED_SUBCLASS_COUNT",
    "ROGUE_FINAL_ORPHAN_OR_UNSUPPORTED_SUBCLASS",
    "ROGUE_FINAL_DUPLICATE_ACTIVE_CATALOG_KEYS",
    "ROGUE_FINAL_BASE_FEATURE_GAP",
    "ROGUE_FINAL_DUPLICATE_MECHANIC_IDS",
    "ROGUE_FINAL_ACTION_FEATURE_REF_INVALID",
    "ROGUE_FINAL_BROKEN_RESOURCE_REFS",
    "ROGUE_FINAL_CHOICE_CONTRACT_INVALID",
    "ROGUE_FINAL_ARCANE_SPELL_LINK_PARITY_INVALID",
    "ROGUE_FINAL_SOULKNIFE_POOL_INVALID",
    "ROGUE_FINAL_STRIKE_CONTRACT_INVALID",
    "ROGUE_FINAL_REQUIRED_RPC_PRIVILEGES_INVALID",
  ]) {
    assert.ok(migration.includes(marker), marker)
  }

  const readyWrite = migration.indexOf("'mechanics_status','READY'")
  const certificationStart = migration.indexOf(
    "create or replace function private.certify_rogue_runtime_final_v1",
  )
  const finalChecks = migration.indexOf(
    "ROGUE_FINAL_REQUIRED_RPC_PRIVILEGES_INVALID",
  )
  assert.ok(certificationStart >= 0)
  assert.ok(finalChecks > certificationStart)
  assert.ok(readyWrite > finalChecks)
  assert.match(migration, /xphb-2024-rogue-runtime-final-v1/)
})

test("Stage 7 certifies representative Rogue-level progression and exact strike costs", () => {
  for (const checkpoint of [
    "(1,1)",
    "(3,2)",
    "(5,3)",
    "(7,4)",
    "(11,6)",
    "(14,7)",
    "(17,9)",
    "(20,10)",
  ]) {
    assert.ok(migration.includes(checkpoint), checkpoint)
  }

  for (const [id, cost] of [
    ["rogue-cunning-strike-poison", 1],
    ["rogue-cunning-strike-trip", 1],
    ["rogue-cunning-strike-withdraw", 1],
    ["rogue-cunning-strike-combo-poison-trip", 2],
    ["rogue-cunning-strike-combo-poison-withdraw", 2],
    ["rogue-cunning-strike-combo-trip-withdraw", 2],
    ["rogue-devious-strike-daze", 2],
    ["rogue-devious-strike-obscure", 3],
    ["rogue-devious-strike-knockout", 6],
  ] as const) {
    assert.ok(migration.includes(`('${id}',${cost})`), id)
  }
})

test("Arcane Trickster final gate stays on shared Wizard spell catalog and GENA spell execution", () => {
  assert.match(migration, /arcane_trickster_cantrips/)
  assert.match(migration, /arcane_trickster_prepared_spells/)
  assert.match(migration, /jsonb_array_length\(v_cantrips->'options'\)<>29/)
  assert.match(migration, /jsonb_array_length\(v_prepared->'options'\)<>206/)
  assert.match(migration, /class_key='wizard'/)
  assert.match(migration, /ROGUE_FINAL_ARCANE_MAGE_HAND_MISSING/)
  assert.match(migration, /ROGUE_FINAL_ARCANE_METHOD_INVALID/)
  assert.match(
    migration,
    /public\.send_chat_template_spell_v2\(uuid,uuid,text,text,text,text,jsonb,uuid\)/,
  )
  assert.match(
    migration,
    /public\.arcane_trickster_steal_spell_v1\(uuid,uuid,boolean\)/,
  )
})

test("Soulknife final gate locks exact 2024 Psionic Energy Dice progression", () => {
  for (const pair of [
    "(3,4)",
    "(5,6)",
    "(9,8)",
    "(13,10)",
    "(17,12)",
  ]) {
    assert.ok(migration.includes(pair), pair)
  }
  for (const pair of ["(3,6)", "(5,8)", "(11,10)", "(17,12)"]) {
    assert.ok(migration.includes(pair), pair)
  }
  assert.match(
    migration,
    /"short_rest","restore":"amount"|short_rest[\s\S]*?restore[\s\S]*?amount/,
  )
  assert.match(migration, /soulknife_psychic_blade/)
  assert.match(migration, /soulknife_psychic_blade_bonus/)
})

test("assignment removal cleanup is generic and retains a shared resource if another assignment still contributes it", () => {
  assert.match(
    migration,
    /private\.template_assignment_resource_keys_v1/,
  )
  assert.match(
    migration,
    /character_template_assignments_cleanup_resources_v1/,
  )
  assert.match(
    migration,
    /not exists\([\s\S]*?remaining\.state_key=s\.state_key/,
  )

  const cleanupStart = migration.indexOf(
    "create or replace function private.cleanup_template_resource_states_after_assignment_delete_v1",
  )
  const cleanupEnd = migration.indexOf(
    "-- ---------------------------------------------------------------------------\n-- Final family mechanics",
    cleanupStart,
  )
  const cleanupBody = migration.slice(cleanupStart, cleanupEnd)
  assert.doesNotMatch(cleanupBody, /rogue_|class:rogue|subclass:rogue/)
})

test("Rogue presentation and chat execution have no class-specific mechanics branch", () => {
  for (const [name, source] of [
    ["classPresentation", classPresentation],
    ["ChatActionPanel", chatPanel],
    ["ChatActionHost", chatHost],
  ] as const) {
    assert.doesNotMatch(source, /class:rogue|subclass:rogue|rogue_/i, name)
  }

  assert.match(classPresentation, /ResolvedCharacterContract/)
  assert.match(classPresentation, /contract\.actions|contract\.resources|contract\.spells/)
  assert.match(chatHost, /templateMechanicIdForChatAction/)
  assert.match(chatHost, /genaSession\.sendTemplateAction/)
  assert.match(chatHost, /genaSession\.sendTemplateSpell/)
  assert.match(chatHost, /resourceCostInputs/)
})

test("Stage 7 keeps internal installers off anon/authenticated while required player RPCs are explicitly audited", () => {
  assert.match(
    migration,
    /revoke all on function private\.certify_rogue_runtime_final_v1\(uuid\)[\s\S]*?from public,anon,authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function private\.certify_rogue_runtime_final_v1\(uuid\)[\s\S]*?to service_role/,
  )
  assert.match(migration, /ROGUE_FINAL_INTERNAL_HELPER_PRIVILEGES_INVALID/)
  assert.match(migration, /has_function_privilege\('anon'/)
  assert.match(migration, /has_function_privilege\([\s\S]*?'authenticated'/)
})

test("READY metadata explicitly closes the reference-only and unfinished-stage flags", () => {
  assert.match(migration, /'runtime_stage',7/)
  assert.match(migration, /'runtime_status','ready'/)
  assert.match(migration, /'stage7_final_certified',true/)
  assert.match(migration, /'reference_runtime_ready',true/)
  assert.match(
    migration,
    /'reference_only_until_final_certification',false/,
  )
  assert.match(
    migration,
    /- 'core_gameplay_runtime_pending_stage3'[\s\S]*?- 'remaining_base_runtime_pending_stage4'/,
  )
})
