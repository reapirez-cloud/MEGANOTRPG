import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const sql = readFileSync(
  new URL("../supabase/migrations/20260922095000_artificer_stage4_base_runtime_v1.sql", import.meta.url),
  "utf8",
)

const reconcileFix = readFileSync(
  new URL("../supabase/migrations/20260922100500_artificer_stage4_stage3_reconcile_fix_v1.sql", import.meta.url),
  "utf8",
)

const plan = readFileSync(
  new URL("../src/data/classes/artificerRuntimePlan.md", import.meta.url),
  "utf8",
)

const ledger = readFileSync(
  new URL("../src/rule-templates/CLASS_WORK_STATUS.md", import.meta.url),
  "utf8",
)

function representativeStage4Bundle(): CharacterTemplateBundle {
  return {
    template: {
      id: "artificer-stage4",
      campaign_id: "campaign",
      kind: "class",
      slug: "artificer",
      name: "Артификер",
      description: "Точный тестовый пакет базового Артификера после закрытия Stage 4.",
      version: 1,
      mechanics: [
        {
          id: "flash-feature",
          type: "grant",
          target: "feature",
          key: "feature:artificer-flash-of-genius",
          sourceKey: "flash-of-genius",
          payload: {
            label: "Вспышка гениальности",
            description: "Когда видимое существо проваливает проверку характеристики или спасбросок, вы можете реакцией добавить к броску модификатор Интеллекта. Число использований равно модификатору Интеллекта, минимум 1; весь запас восстанавливается после долгого отдыха.",
          },
        },
        {
          id: "flash-resource",
          type: "resource",
          key: "artificer_flash_of_genius",
          label: "Вспышка гениальности",
          max: 4,
          recharge: "long_rest",
          sourceKey: "flash-of-genius",
        },
        {
          id: "flash-action",
          type: "action",
          key: "artificer_flash_of_genius",
          label: "Вспышка гениальности",
          economy: "reaction",
          resourceKey: "artificer_flash_of_genius",
          resourceCost: 1,
          sourceKey: "flash-of-genius",
        },
      ],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:artificer",
      catalog_revision: "efota-2025-artificer-stage4-base-runtime-v1",
      source_kind: "official",
      source_label: "Eberron: Forge of the Artificer (2025)",
      is_builtin: true,
      mechanical_summary: "Intelligence-based magical inventor with authoritative item, spell-slot, attunement, finite-resource and character-state integrations through the shared runtime.",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-22T00:00:00Z",
      updated_at: "2026-09-22T00:00:00Z",
    },
    assignment: {
      id: "assignment",
      character_id: "character",
      template_id: "artificer-stage4",
      template_level: 14,
      selected_choices: {},
      assigned_at: "2026-09-22T00:00:00Z",
      updated_at: "2026-09-22T00:00:00Z",
    },
    levels: [],
  }
}

test("Stage 4 package runs the shared class quality, resource, parser and CE gates", () => {
  const bundle = representativeStage4Bundle()
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))

  const parsed = resolveTemplateBundles([bundle], 14)
  const contract = resolveCharacterContract({
    base: {
      id: "character",
      name: "Artificer",
      level: 14,
      abilities: {
        strength: 8,
        dexterity: 14,
        constitution: 14,
        intelligence: 18,
        wisdom: 10,
        charisma: 10,
      },
      baseMaxHp: 100,
      baseSpeed: 30,
    },
    state: {
      currentHp: 100,
      tempHp: 0,
      resources: { artificer_flash_of_genius: { current: 4 } },
    },
    contributions: parsed.contributions,
  })

  const resource = contract.resources.find(
    (entry) => entry.key === "artificer_flash_of_genius",
  )
  const action = contract.actions.find(
    (entry) => entry.key === "artificer_flash_of_genius",
  )
  assert.ok(resource)
  assert.equal(resource.max.value, 4)
  assert.ok(action)
  assert.equal(action.resourceCosts[0]?.stateKey, "artificer_flash_of_genius")
})

test("Stage 4 replaces every pending base placeholder with runtime-backed mechanics", () => {
  assert.match(sql, /efota-2025-artificer-stage4-base-runtime-v1/)
  assert.match(sql, /IN_PROGRESS_STAGE4_BASE_READY/)
  assert.match(sql, /ARTIFICER_STAGE4_PLACEHOLDERS_REMAIN/)
  assert.match(sql, /artificer-magic-item-charge-action/)
  assert.match(sql, /artificer-flash-of-genius-action/)
  assert.match(sql, /artificer-spell-storing-item-action/)
  assert.match(sql, /artificer-soul-of-artifice-cheat-death-action/)
  assert.doesNotMatch(sql, /'mechanics_status','READY'/)
})

test("Stage 4 release gate repairs Stage 3 replica reconciliation precedence", () => {
  assert.match(reconcileFix, /d\.value->>'option'=\('refdef:'\|\|\(i\.item_state->>'plan_definition_id'\)\)/)
  assert.doesNotMatch(reconcileFix, /d\.value->>'option'='refdef:'\|\|i\.item_state->>'plan_definition_id'/)
})

test("Magic Item Tinker uses shared item and spell-slot owners", () => {
  assert.match(sql, /private\.cheburashka_restore_item_charges_v1/)
  assert.match(sql, /private\.apply_character_runtime_resource_effect\([\s\S]*'spell_slot_'\|\|p_slot_level::text,'SPEND',1/)
  assert.match(sql, /'GRANT_TEMPORARY_MAX',1/)
  assert.match(sql, /private\.cheburashka_safe_delete_item_v1/)
  assert.match(sql, /artificer_replication_loadout/)
  assert.match(sql, /artificer_magic_item_transmute/)
  assert.doesNotMatch(sql, /create table\s+(?:public\.)?artificer_/i)
})

test("charged replicated definitions are forward-revised instead of bypassing Chasovoy identity", () => {
  assert.match(sql, /insert into public\.reference_definition_revisions/)
  assert.match(sql, /Wand of Magic Missiles/)
  assert.match(sql, /Wand of Web/)
  assert.match(sql, /Ring of the Ram/)
  assert.match(sql, /Dazzling Weapon/)
  assert.match(sql, /'\{charges_max\}'/)
})

test("Flash of Genius is finite, Intelligence-based, and gains short-rest recovery at level 14", () => {
  assert.match(sql, /artificer_flash_of_genius/)
  assert.match(sql, /abilities\.intelligence\.modifier/)
  assert.match(sql, /'trigger','short_rest','restore','amount','amount',1/)
  assert.match(sql, /'trigger','long_rest','restore','full'/)
  assert.match(sql, /failed_check_or_save_bonus/)
})

test("attunement limits are enforced by inventory state and progress 3 to 4 to 5 to 6", () => {
  assert.match(sql, /artificer_stage4_attunement_capacity_v1/)
  assert.match(sql, /when a\.class_level>=18 then 6/)
  assert.match(sql, /when a\.class_level>=14 then 5/)
  assert.match(sql, /when a\.class_level>=10 then 4/)
  assert.match(sql, /else 3/)
  assert.match(sql, /ARTIFICER_ATTUNEMENT_CAP_REACHED/)
  assert.match(sql, /values\.artificer_attunement_capacity/)
})

test("Spell-Storing Item is inventory-backed and uses the shared chat spell surface", () => {
  assert.match(sql, /artificer_store_spell_item_v1/)
  assert.match(sql, /artificer_use_spell_storing_item_v1/)
  assert.match(sql, /spell_level not between 1 and 3/)
  assert.match(sql, /material_consumed/)
  assert.match(sql, /greatest\(2,2\*v_int_mod\)/)
  assert.match(sql, /public\.send_chat_event_v3/)
  assert.match(sql, /'concentration',v_spell\.concentration/)
})

test("Soul of Artifice requires zero HP, consumes only qualifying replicas, and heals 20 per item", () => {
  assert.match(sql, /ARTIFICER_CHEAT_DEATH_REQUIRES_ZERO_HP/)
  assert.match(sql, /v_rarity not in \('uncommon','rare'\)/)
  assert.match(sql, /20\*v_count/)
  assert.match(sql, /private\.shapoklyak_set_current_hp_system_v1/)
  assert.match(sql, /artificer_stage4_magical_guidance_after_short_rest_v1/)
  assert.match(sql, /state_key='artificer_flash_of_genius'/)
})

test("Stage 4 closes base runtime but keeps subclasses and final READY for later stages", () => {
  assert.match(plan, /Stage 4 — remaining base class 1–20:\s*COMPLETE_2026_09_22/)
  assert.match(plan, /Stage 5 — subclass wave 1:\s*NEXT/)
  assert.match(ledger, /stage_4_remaining_base_runtime: COMPLETE_2026_09_22/)
  assert.match(ledger, /IN_PROGRESS_STAGE_4_COMPLETE/)
})
