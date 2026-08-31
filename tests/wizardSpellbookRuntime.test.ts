import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260831110000_wizard_spellbook_runtime.sql",
  "utf8",
)
const panel = fs.readFileSync("src/components/characters/WizardSpellbookPanel.tsx", "utf8")
const preparationHook = fs.readFileSync("src/hooks/useChatPreparation.ts", "utf8")

function wizardBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "wizard-assignment",
      character_id: "wizard-character",
      template_id: "wizard-template",
      template_level: 5,
      selected_choices: {},
      assigned_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    template: {
      id: "wizard-template",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "wizard-core",
      name: "Волшебник",
      description: "Волшебник ведёт физическую книгу заклинаний.",
      version: 1,
      mechanics: [],
      choices: [],
      mechanical_summary: "Книга ограничивает доступную ежедневную подготовку.",
      rules_meta: { spell_preparation_refresh: "long_rest" },
      is_active: true,
      created_by: null,
      created_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    levels: [],
  }
}

test("Wizard spellbook runtime remains a real inventory-instance dependency", () => {
  assert.match(migration, /wizard_spellbook_entries/)
  assert.match(migration, /spellbook_item_id uuid not null references public\.character_inventory_items\(id\) on delete cascade/)
  assert.match(migration, /definition_id uuid references public\.reference_definitions/)
  assert.match(migration, /wizard-spellbook-2024/)
  assert.match(migration, /source_definition_id/)
})

test("GM authors concrete book contents from the canonical Wizard catalog", () => {
  assert.match(migration, /gm_add_wizard_spellbook_spell/)
  assert.match(migration, /gm_remove_wizard_spellbook_spell/)
  assert.match(migration, /private\.can_manage_character/)
  assert.match(migration, /class_key = 'wizard'/)
  assert.match(migration, /wizard_max_spell_level_for_character/)
  assert.match(migration, /insert into public\.character_spells\(character_id,catalog_spell_id,prepared\)/)
})

test("GENA cannot prepare Wizard spells without the physical book or outside its pages", () => {
  assert.match(migration, /Wizard spellbook is required to change prepared spells/)
  assert.match(migration, /wizard_spellbook_entries/)
  assert.match(migration, /Prepared Wizard spell is not written in an owned spellbook/)
  assert.match(migration, /character_has_wizard_class/)
})

test("Wizard class UI exposes My Book and manager grant flow", () => {
  assert.match(panel, /Моя книга/)
  assert.match(panel, /Выдать закл/)
  assert.match(panel, /listWizardSpellbooks/)
  assert.match(panel, /listWizardSpellbookCandidates/)
  assert.match(panel, /gmAddWizardSpellbookSpell/)
})

test("chat preparation reads the server-owned spellbook availability", () => {
  assert.match(preparationHook, /listWizardSpellbookEntries/)
  assert.match(preparationHook, /catalog_spell_id/)
  assert.match(preparationHook, /catalogKey/)
})

test("spellbook mechanics package obeys the class persistent-resource policy", () => {
  assert.doesNotThrow(() => assertClassResourcePolicy([wizardBundle()]))
})
