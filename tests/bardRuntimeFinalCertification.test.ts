import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import {
  BARD_RUNTIME_REFERENCE_SUBCLASS_IDS,
  classReference,
} from "../src/data/classReference.ts"
import {
  BARD_REFERENCE_ONLY_CATALOG_KEYS,
  BARD_RUNTIME_CATALOG_KEYS,
} from "../src/rule-templates/bardRuntimeCatalog.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { presentClassPackages } from "../src/rule-templates/classPresentation.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260911175500_bard_runtime_final_certification_v1.sql",
  "utf8",
)
const gateway = fs.readFileSync("src/game-engine/supabase.ts", "utf8")
const chatRoom = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")
const choicesUi = fs.readFileSync("src/components/characters/CharacterTemplateChoices.tsx", "utf8")
const classPresentationSource = fs.readFileSync("src/rule-templates/classPresentation.ts", "utf8")

function feature(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  mechanic: Record<string, unknown>,
): StoredMechanic {
  return {
    id,
    type: "grant",
    sourceKey,
    target: "feature",
    key,
    payload: {
      label,
      description:
        "Эта способность использует указанный источник, точные числовые параметры и описанный эффект; условия сцены и момента применения остаются на усмотрение ведущего.",
      mechanic,
    },
  }
}

function parentBundle(bardLevel: number): CharacterTemplateBundle {
  return {
    assignment: {
      id: "bard-final-parent-assignment",
      character_id: "bard-final-character",
      template_id: "bard-final-parent",
      template_level: bardLevel,
      selected_choices: {},
      assigned_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    template: {
      id: "bard-final-parent",
      campaign_id: "campaign",
      kind: "class",
      slug: "bard-core",
      name: "Бард",
      description: "Финально сертифицированный runtime Барда.",
      version: 1,
      mechanics: [],
      choices: [],
      catalog_key: "class:bard",
      catalog_revision: "xphb-2024-bard-runtime-final-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary:
        "Бард использует общий запас Вдохновения барда, заклинательный runtime, устойчивые выборы и дочерние колледжи через единый Character Engine контракт.",
      rules_meta: { mechanics_status: "READY", runtime_status: "ready" },
      is_active: true,
      created_by: null,
      created_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    levels: [{
      id: "bard-final-parent-l1",
      template_id: "bard-final-parent",
      level: 1,
      mechanics: [
        feature(
          "bard-final-bi-feature",
          "bardic-inspiration",
          "class:bard:bardic-inspiration:l1",
          "Вдохновение барда",
          { kind: "bardic_inspiration", dieValueKey: "bardic_inspiration_die_sides" },
        ),
        {
          id: "bard-final-bi-resource",
          type: "resource",
          sourceKey: "bardic-inspiration",
          key: "bardic_inspiration",
          label: "Вдохновение барда",
          max: 4,
          recharge: ["short_rest", "long_rest"],
          initial: "full",
        },
      ],
      choices: [],
    }],
  }
}

function swordsBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "bard-final-swords-assignment",
      character_id: "bard-final-character",
      template_id: "bard-final-swords",
      template_level: null,
      selected_choices: {},
      assigned_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    template: {
      id: "bard-final-swords",
      campaign_id: "campaign",
      kind: "subclass",
      slug: "bard-swords",
      name: "Коллегия Мечей",
      description: "Сертифицированный runtime Коллегии Мечей.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: "bard-final-parent",
      unlock_level: 3,
      catalog_key: "subclass:bard:swords",
      catalog_revision: "bard-stage5-subclasses-runtime-v1",
      source_kind: "official",
      source_label: "Xanathar's Guide to Everything",
      is_builtin: true,
      mechanical_summary:
        "Коллегия Мечей использует родительский уровень Барда, общий запас Вдохновения и структурированные действия Росчерка без собственного движка.",
      rules_meta: { runtime_status: "ready", parent_level_certified: true },
      is_active: true,
      created_by: null,
      created_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    levels: [
      {
        id: "bard-final-swords-l3",
        template_id: "bard-final-swords",
        level: 3,
        mechanics: [
          feature(
            "bard-final-swords-feature",
            "bard:swords:blade-flourish",
            "bard_swords_blade_flourish",
            "Росчерк клинка",
            { kind: "blade_flourish", resource: "bardic_inspiration" },
          ),
          {
            id: "bard-final-swords-action",
            type: "action",
            sourceKey: "bard:swords:blade-flourish",
            key: "bard_swords_defensive_flourish",
            label: "Защитный росчерк",
            economy: "special",
            resourceCosts: [{ key: "bardic_inspiration", amount: 1 }],
            effects: [{ kind: "semantic", key: "swords_defensive_flourish" }],
            tags: ["bard", "subclass", "swords", "bardic-inspiration"],
          },
        ],
        choices: [],
      },
      {
        id: "bard-final-swords-l6",
        template_id: "bard-final-swords",
        level: 6,
        mechanics: [
          feature(
            "bard-final-swords-extra-attack",
            "bard:swords:extra-attack",
            "bard_swords_extra_attack",
            "Дополнительная атака",
            { kind: "extra_attack", attacks: 2 },
          ),
        ],
        choices: [],
      },
      {
        id: "bard-final-swords-l14",
        template_id: "bard-final-swords",
        level: 14,
        mechanics: [
          feature(
            "bard-final-swords-master",
            "bard:swords:masters-flourish",
            "bard_swords_masters_flourish",
            "Росчерк мастера",
            { kind: "masters_flourish", freeFlourishDie: { count: 1, sides: 6 } },
          ),
        ],
        choices: [],
      },
    ],
  }
}

function packageAt(bardLevel: number) {
  return [parentBundle(bardLevel), swordsBundle()]
}

function contractAt(bardLevel: number, totalLevel: number) {
  const bundles = packageAt(bardLevel)
  const parsed = resolveTemplateBundles(bundles, totalLevel)
  const input: CharacterEngineInput = {
    base: {
      id: "bard-final-character",
      name: "Бард",
      level: totalLevel,
      abilities: {
        strength: 8,
        dexterity: 16,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 18,
      },
      baseMaxHp: 70,
      baseSpeed: 30,
    },
    state: {
      currentHp: 70,
      tempHp: 0,
      resources: { bardic_inspiration: { current: 4 } },
    },
    contributions: parsed.contributions,
  }
  return {
    bundles,
    parsed,
    contract: resolveCharacterContract(input),
  }
}

test("Bard Stage 6 migration is a strict fail-closed certification package", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*class:bard/i)
  assert.match(migration, /CLASS_RESOURCE_POLICY:\s*short-long-rest-v1/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/bardRuntimeFinalCertification\.test\.ts/i)

  for (const marker of [
    "BARD_FINAL_LEVEL_ROWS_INVALID",
    "BARD_FINAL_STAGE_STACK_INCOMPLETE",
    "BARD_FINAL_INSPIRATION_DIE_INVALID",
    "BARD_FINAL_FONT_ACTION_INVALID",
    "BARD_FINAL_EXPERTISE_CHOICE_INVALID",
    "BARD_FINAL_JACK_OF_ALL_TRADES_INVALID",
    "BARD_FINAL_COUNTERCHARM_INVALID",
    "BARD_FINAL_MAGICAL_SECRETS_GATE_INVALID",
    "BARD_FINAL_WORDS_OF_CREATION_SPELLS_INVALID",
    "BARD_FINAL_ACTIVE_SUBCLASS_COUNT",
    "BARD_FINAL_SUBCLASS_LEVELS_INVALID",
    "BARD_FINAL_BROKEN_RESOURCE_REFS",
    "BARD_FINAL_DUPLICATE_MECHANIC_IDS",
    "BARD_FINAL_NONCANONICAL_INSPIRATION_SPENDER",
    "BARD_FINAL_ACTION_WITHOUT_FEATURE",
    "BARD_FINAL_REQUIRED_RPC_PRIVILEGES_INVALID",
  ]) assert.ok(migration.includes(marker), marker)
})

test("final Bard fixture passes strict package/resource gates and parser to CE", () => {
  const bundles = packageAt(14)
  assert.doesNotThrow(() => assertClassPackageQuality(bundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(bundles))

  const { parsed, contract } = contractAt(14, 14)
  assert.ok(parsed.contributions.length > 0)
  assert.equal(contract.resources.find((entry) => entry.key === "bardic_inspiration")?.max.value, 4)
  assert.ok(contract.actions.some((entry) => entry.key === "bard_swords_defensive_flourish"))
})

test("multiclass resolution uses Bard parent level instead of total character level", () => {
  const lowBard = contractAt(3, 12).contract
  assert.ok(lowBard.actions.some((entry) => entry.key === "bard_swords_defensive_flourish"))
  assert.equal(
    lowBard.rules.some((entry) => entry.key === "bard_swords_extra_attack"),
    false,
    "total level must not unlock Bard 6 subclass mechanics",
  )

  const bardSix = contractAt(6, 12).contract
  assert.ok(bardSix.rules.some((entry) => entry.key === "bard_swords_extra_attack"))
})

test("public reference exposes exactly the certified Bard runtime boundary", () => {
  const bard = classReference.find((entry) => entry.id === "bard")
  assert.ok(bard)
  assert.equal(bard.referenceOnly, false)

  const runtimeIds = new Set(BARD_RUNTIME_REFERENCE_SUBCLASS_IDS)
  assert.equal(runtimeIds.size, 9)
  assert.deepEqual(
    [...runtimeIds].sort(),
    BARD_RUNTIME_CATALOG_KEYS.map((key) => key.replace("subclass:bard:", "")).sort(),
  )

  for (const subclass of bard.subclasses) {
    assert.equal(subclass.referenceOnly, !runtimeIds.has(subclass.id), subclass.id)
  }

  assert.deepEqual(
    bard.subclasses
      .filter((entry) => entry.referenceOnly)
      .map((entry) => `subclass:bard:${entry.id}`)
      .sort(),
    [...BARD_REFERENCE_ONLY_CATALOG_KEYS].sort(),
  )
})

test("Class tab presents Bard mechanics from the resolved CE contract", () => {
  const { bundles, contract } = contractAt(3, 12)
  const parent = bundles[0]!
  const subclass = bundles[1]!

  const presented = presentClassPackages(contract, [{
    classAssignmentId: parent.assignment.id,
    classTemplateId: parent.template.id,
    classCatalogKey: parent.template.catalog_key,
    className: parent.template.name,
    level: 3,
    subclassTemplateId: subclass.template.id,
    subclassName: subclass.template.name,
    subclassUnlockLevel: subclass.template.unlock_level ?? 3,
    subclassActive: true,
  }])[0]!

  assert.ok(presented.classMechanics.entries.some((entry) =>
    entry.type === "resource" && entry.integration === "runtime",
  ))
  assert.ok(presented.subclassMechanics?.entries.some((entry) =>
    entry.type === "special_action" && entry.integration === "runtime",
  ))
  assert.doesNotMatch(classPresentationSource, /if\s*\([^)]*bard|className\s*===\s*["']Бард/i)
})

test("Chat and choices stay on shared GENA/runtime routes without Bard branches", () => {
  assert.match(gateway, /send_chat_template_action_v2/)
  assert.match(gateway, /send_chat_template_spell_v2/)
  assert.match(chatRoom, /chat\.sendTemplateAction/)
  assert.match(chatRoom, /chat\.sendTemplateSpell/)
  assert.match(choicesUi, /commitCharacterTemplateChoiceV2/)
  assert.match(choicesUi, /commitCharacterTemplateRestChoice/)
  assert.match(choicesUi, /const result = state\.refresh\s*\? await commitCharacterTemplateRestChoice/)
  assert.doesNotMatch(gateway, /if\s*\([^)]*bard/i)
  assert.doesNotMatch(chatRoom, /if\s*\([^)]*bard/i)
  assert.doesNotMatch(choicesUi, /if\s*\([^)]*bard/i)
})

test("Stage 6 records unsupported cross-class systems as generic debt instead of faking Bard-only runtime", () => {
  assert.match(migration, /'multiclass_parent_level_certified',true/)
  assert.match(migration, /'multiclass_entry_profile_runtime','generic_pending'/)
  assert.match(migration, /'multiclass_spell_slot_aggregation_runtime','generic_pending'/)
  assert.match(migration, /'feat_source_runtime','generic_pending'/)
  assert.doesNotMatch(migration, /bard_multiclass_slot|bard_feat_runtime|bard_asi_runtime/)
})

test("READY is written only after the final fail-closed gates", () => {
  const lastGate = migration.lastIndexOf("BARD_FINAL_REQUIRED_RPC_PRIVILEGES_INVALID")
  const readyWrite = migration.indexOf("'mechanics_status','READY'")
  assert.ok(lastGate >= 0)
  assert.ok(readyWrite > lastGate)
  assert.match(migration, /'runtime_stage',6/)
  assert.match(migration, /xphb-2024-bard-runtime-final-v1/)
  assert.match(migration, /'runtime_certified_at','2026-09-11'/)
  assert.match(migration, /'runtime_status','ready'/)
  assert.match(migration, /'reference_runtime_ready',true/)
})

test("new campaigns install Stage 5 and immediately pass final Stage 6 certification", () => {
  const installer = migration.match(
    /create or replace function private\.ensure_bard_runtime_final_v1\(p_campaign_id uuid\)[\s\S]*?\$function\$;/,
  )
  assert.ok(installer)
  const body = installer[0]
  const stage5 = body.indexOf("ensure_bard_subclasses_stage5_v1")
  const certify = body.indexOf("certify_bard_runtime_final_v1")
  assert.ok(stage5 >= 0)
  assert.ok(certify > stage5)

  assert.match(migration, /drop trigger if exists aaaaaaaak_campaigns_ensure_bard_subclasses_stage5_v1/)
  assert.match(migration, /create trigger aaaaaaaal_campaigns_ensure_bard_runtime_final_v1/)
})
