import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260921212000_artificer_stage2_foundation_spellcasting_v1.sql", import.meta.url),
  "utf8",
)
const plan = readFileSync(new URL("../src/data/classes/artificerRuntimePlan.md", import.meta.url), "utf8")
const ledger = readFileSync(new URL("../src/rule-templates/CLASS_WORK_STATUS.md", import.meta.url), "utf8")

function bundleAt(level: number): CharacterTemplateBundle {
  return {
    template: {
      id: "artificer",
      campaign_id: "campaign",
      kind: "class",
      slug: "artificer-core",
      name: "Артификер",
      description: "Technical Artificer 2025 runtime foundation.",
      version: 1,
      mechanics: [
        { id: "save-int", type: "grant", sourceKey: "save-int", target: "proficiency", key: "savingThrow:intelligence", payload: { rank: 1 } },
        { id: "simple", type: "grant", sourceKey: "simple", target: "proficiency", key: "weapon:simple", payload: { rank: 1 } },
      ],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:artificer",
      catalog_revision: "efota-2025-artificer-stage2-foundation-spellcasting-v1",
      source_kind: "official",
      source_label: "Eberron: Forge of the Artificer (2025)",
      is_builtin: true,
      mechanical_summary: "Intelligence-based magical inventor using prepared spells, tool proficiencies, shared spell slots, and item-focused class features across levels 1–20.",
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
      template_level: level,
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
          id: "slot1", type: "resource", sourceKey: "spellcasting", key: "spell_slot_1",
          label: "Spell Slot 1", max: level >= 5 ? 4 : 2, recharge: ["long_rest"], restore: "full", initial: "full",
        },
        {
          id: "mending", type: "spell", sourceKey: "tinkers-magic", key: "spell:mending",
          catalogSlug: "mending", variantKey: "artificer:tinkers-magic:mending",
          payload: {
            spell: { name: "Mending", level: 0, school: "Transmutation", ritual: false },
            preparation: { mode: "not_required" },
            methods: [{ key: "artificer-cast", kind: "class_spell", ability: "intelligence", requiresPrepared: false }],
          },
        },
      ],
      choices: [],
    }],
  }
}

test("Artificer Stage 2 representative bundle passes shared package/resource/parser/CE gates", () => {
  const bundle = bundleAt(5)
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))
  const parsed = resolveTemplateBundles([bundle], 5)
  const contract = resolveCharacterContract({
    base: {
      id: "character", name: "Artificer", level: 5,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 10, charisma: 10 },
      baseMaxHp: 38, baseSpeed: 30,
    },
    state: { currentHp: 38, tempHp: 0, resources: { spell_slot_1: { current: 4 } } },
    contributions: parsed.contributions,
  })
  assert.ok(contract.capabilities.proficiencies.some((entry) => entry.key === "savingThrow:intelligence"))
  const slot = contract.resources.find((entry) => entry.key === "spell_slot_1")
  assert.ok(slot)
  assert.equal(slot.max.value, 4)
  const mending = contract.spells.find((entry) => entry.key === "spell:mending")
  assert.ok(mending)
  assert.equal(mending.accesses[0]?.methods[0]?.ability, "intelligence")
})

test("Stage 2 installs one clean Artificer class with exact 20-level non-READY structure", () => {
  assert.match(migration, /catalog_key='class:artificer'/)
  assert.match(migration, /efota-2025-artificer-stage2-foundation-spellcasting-v1/)
  assert.match(migration, /for v_level in 1\.\.20 loop/i)
  assert.match(migration, /IN_PROGRESS_STAGE2_FOUNDATION_SPELLCASTING_READY/)
  assert.match(migration, /'subclass_runtime_included',false/)
  assert.match(migration, /ARTIFICER_STAGE2_SUBCLASS_RUNTIME_LEAK/)
  assert.doesNotMatch(migration, /'mechanics_status','READY'/)
})

test("Stage 2 freezes exact core traits and tool choice", () => {
  for (const key of [
    "savingThrow:constitution", "savingThrow:intelligence", "armor:light", "armor:medium",
    "armor:shield", "weapon:simple", "tool:thieves-tools", "tool:tinkers-tools",
  ]) assert.ok(migration.includes(key), key)
  assert.match(migration, /'artificer-skills'[\s\S]*?'count',2/)
  assert.match(migration, /'artificer-artisan-tool'[\s\S]*?'kind','unproficient_skill_or_tool'/)
  assert.match(migration, /spellcasting_focus:artificer-tools/)
})

test("Stage 2 reconciles the frozen 2025 spell set and fills six missing shared definitions", () => {
  for (const slug of [
    "thorn-whip", "arcane-vigor", "leomund-s-secret-chest",
    "mordenkainen-s-faithful-hound", "mordenkainen-s-private-sanctum",
    "otiluke-s-resilient-sphere",
  ]) assert.ok(migration.includes(slug), slug)
  assert.match(migration, /spell_catalog_target_count',92/)
  assert.match(migration, /ARTIFICER_STAGE2_SPELL_LINK_COUNT_INVALID/)
  assert.match(migration, /jsonb_array_length\(v_cantrip_options\)<>21/)
  assert.match(migration, /jsonb_array_length\(v_spell_options\)<>70/)
})

test("Stage 2 owns exact cantrip, preparation and half-caster slot progression", () => {
  assert.match(migration, /'count_by_level',jsonb_build_object\('1',2,'10',3,'14',4\)/)
  assert.match(migration, /"1":2,"2":3,"3":4,"4":5,"5":6/)
  assert.match(migration, /"17":14,"18":14,"19":15,"20":15/)
  assert.match(migration, /"5":\{"1":4,"2":2\}/)
  assert.match(migration, /"9":\{"1":4,"2":3,"3":2\}/)
  assert.match(migration, /"13":\{"1":4,"2":3,"3":3,"4":1\}/)
  assert.match(migration, /"17":\{"1":4,"2":3,"3":3,"4":3,"5":1\}/)
  assert.match(migration, /"20":\{"1":4,"2":3,"3":3,"4":3,"5":2\}/)
  assert.match(migration, /artificer_half_caster_round_up/)
})

test("Tinker's Magic grants Mending outside the ordinary cantrip quota", () => {
  assert.match(migration, /s\.spell_level=0 and s\.slug<>'mending'/)
  assert.match(migration, /artificer_stage2_spell_mechanic_v1\('mending','tinkers-magic'\)/)
  assert.match(migration, /ARTIFICER_STAGE2_MENDING_GRANT_MISSING/)
})

test("Stage 2 adds a generic Chasovoy item-plan validation primitive for Stage 3", () => {
  assert.match(migration, /reference_item_plan_option_valid_v1/)
  assert.match(migration, /replication_plan,eligible/)
  assert.match(migration, /v_kind='reference_item_plans'/)
  assert.match(migration, /CHOICE_PROVIDER_REFERENCE_ITEM_PLAN_INELIGIBLE/)
})

test("Stage 2 keeps literature deferred and hands off cleanly to Stage 3", () => {
  assert.match(plan, /Stage 2 — class foundation 1–20 \+ spellcasting:\s*COMPLETE_2026_09_21/)
  assert.match(plan, /Stage 3 — core item\/replication runtime:\s*COMPLETE_2026_09_21/)
  assert.match(ledger, /stage_2_foundation_1_20_and_spellcasting: COMPLETE_2026_09_21/)
  assert.match(ledger, /Text:\*\*\s*`DEFERRED_USER_TRANSLATION`/)
  assert.match(migration, /author_description='',author_comment=''/)
  assert.match(migration, /literary_layer_required_for_runtime',false/)
})
