import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { createInventoryMechanicalProjection } from "../src/inventory-engine/projection.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260921223000_artificer_stage3_item_replication_runtime_v1.sql", import.meta.url),
  "utf8",
)
const plan = readFileSync(new URL("../src/data/classes/artificerRuntimePlan.md", import.meta.url), "utf8")
const ledger = readFileSync(new URL("../src/rule-templates/CLASS_WORK_STATUS.md", import.meta.url), "utf8")


function stage3Bundle(): CharacterTemplateBundle {
  return {
    template: {
      id: "artificer",
      campaign_id: "campaign",
      kind: "class",
      slug: "artificer-core",
      name: "Артификер",
      description: "Technical Artificer 2025 Stage 3 runtime fixture.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:artificer",
      catalog_revision: "efota-2025-artificer-stage3-item-replication-v1",
      source_kind: "official",
      source_label: "Eberron: Forge of the Artificer (2025)",
      is_builtin: true,
      mechanical_summary: "Item-creation and replication runtime fixture.",
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
      template_id: "artificer",
      template_level: 6,
      selected_choices: {},
      assigned_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    levels: [{
      id: "artificer-l1",
      template_id: "artificer",
      level: 1,
      mechanics: [
        {
          id: "artificer-tinkers-magic-feature",
          type: "grant",
          sourceKey: "tinkers-magic",
          target: "feature",
          key: "class:artificer:tinkers-magic",
          payload: {
            label: "Tinker's Magic",
            description: "Магическим действием создайте один допустимый предмет. Число использований ограничено отдельным запасом и полностью восстанавливается после долгого отдыха.",
          },
        },
        {
          id: "artificer-tinkers-magic-resource",
          type: "resource",
          sourceKey: "tinkers-magic",
          key: "tinkers_magic",
          label: "Tinker's Magic",
          max: 4,
          recharge: "long_rest",
          restore: "full",
          initial: "full",
        },
        {
          id: "artificer-tinkers-magic-create",
          type: "action",
          sourceKey: "tinkers-magic",
          key: "class:artificer:tinkers-magic:create",
          label: "Tinker's Magic",
          economy: "magic_action",
          resourceKey: "tinkers_magic",
          resourceCost: 1,
          tags: ["artificer", "inventory"],
        },
      ],
      choices: [],
    }],
  }
}

test("Stage 3 representative bundle passes shared package/resource/parser/CE gates", () => {
  const bundle = stage3Bundle()
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))
  const parsed = resolveTemplateBundles([bundle], 6)
  const contract = resolveCharacterContract({
    base: {
      id: "character",
      name: "Artificer",
      level: 6,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 10, charisma: 10 },
      baseMaxHp: 45,
      baseSpeed: 30,
    },
    state: { currentHp: 45, tempHp: 0, resources: { tinkers_magic: { current: 4 } } },
    contributions: parsed.contributions,
  })
  assert.equal(contract.resources.find((entry) => entry.key === "tinkers_magic")?.max.value, 4)
  assert.ok(contract.actions.some((entry) => entry.key === "class:artificer:tinkers-magic:create"))
})

function item(attuned: boolean): InventoryItem {
  return {
    id: "attunement-item",
    character_id: "character",
    name: "Attunement fixture",
    quantity: 1,
    weight: 1,
    equipped: true,
    category: "equipment",
    equipment_slot: "other",
    image_url: null,
    description: "",
    mechanics: [{
      id: "attunement-ac",
      type: "numeric",
      sourceKey: "attunement-fixture",
      activation: "equipped",
      target: "combat.ac",
      operation: "ADD",
      value: 1,
    }],
    usage_mode: "none",
    charges_current: null,
    charges_max: null,
    item_state: { attunement: { required: true, attuned } },
    version: 1,
    sort_order: 0,
    created_at: "2026-09-21T00:00:00Z",
    updated_at: "2026-09-21T00:00:00Z",
  }
}

test("Stage 3 freezes exact known-plan and active-item progression without READY", () => {
  assert.match(migration, /'count_by_level',jsonb_build_object\('2',4,'6',5,'10',6,'14',7,'18',8\)/)
  assert.match(migration, /'active_count_by_level',jsonb_build_object\('2',2,'6',3,'10',4,'14',5,'18',6\)/)
  assert.match(migration, /jsonb_array_length\(v_options\)<52/)
  assert.match(migration, /efota-2025-artificer-stage3-item-replication-v1/)
  assert.match(migration, /IN_PROGRESS_STAGE3_CORE_ITEM_RUNTIME_READY/)
  assert.doesNotMatch(migration, /'mechanics_status','READY'/)
})

test("Tinker's Magic is a real finite CE resource and a real Cheburashka creation path", () => {
  assert.match(migration, /artificer-tinkers-magic-resource/)
  assert.match(migration, /abilities\.intelligence\.modifier/)
  assert.match(migration, /artificer-tinkers-magic-create/)
  assert.match(migration, /public\.artificer_create_tinkers_magic_item_v1/)
  assert.match(migration, /private\.cheburashka_create_defined_item_system_v1/)
  assert.match(migration, /'expire_on',jsonb_build_array\('long_rest'\)/)
  assert.match(migration, /character_preparation_sessions_expire_inventory_lifecycle_v1/)
})

test("Replicate Magic Item stays on Choice Runtime + Chasovoy + Cheburashka", () => {
  assert.match(migration, /artificer_replication_plans/)
  assert.match(migration, /kind','reference_item_plans/)
  assert.match(migration, /refdef:/)
  assert.match(migration, /reconcile_character_template_item_plan_loadout_v1/)
  assert.match(migration, /ITEM_PLAN_LOADOUT_ALREADY_RECONCILED_THIS_REST/)
  assert.match(migration, /character_template_assignments_reconcile_item_plans_v1/)
  assert.match(migration, /order by i\.created_at,i\.id/)
  assert.doesNotMatch(migration, /create table\s+(?:public\.)?artificer_/i)
})

test("generic attunement gates item mechanics in the CE projection", () => {
  const off = createInventoryMechanicalProjection("character", [item(false)])
  assert.equal(off.contributions.length, 0)

  const on = createInventoryMechanicalProjection("character", [item(true)])
  assert.ok(on.contributions.some((entry) => entry.kind === "numeric" && entry.target === "combat.ac"))
  assert.notEqual(off.revision, on.revision)
})

test("Stage 3 keeps delayed owner-death cleanup explicit instead of bypassing TOBIK", () => {
  assert.match(migration, /expire_after_1d4_days_via_tobik_or_gm/)
  assert.doesNotMatch(migration, /\brandom\s*\(\s*\)/i)
})

test("Stage 3 remains closed after Stage 4 while literary fields remain deferred", () => {
  assert.match(plan, /Stage 3 — core item\/replication runtime:\s*COMPLETE_2026_09_21/)
  assert.match(plan, /Stage 4 — remaining base class 1–20:\s*COMPLETE_2026_09_22/)
  assert.match(plan, /Stage 5 — subclass wave 1:\s*NEXT/)
  assert.match(ledger, /stage_3_core_item_replication_runtime: COMPLETE_2026_09_21/)
  assert.match(ledger, /DEFERRED_USER_TRANSLATION/)
  assert.match(migration, /author_description='',author_comment=''/)
})
