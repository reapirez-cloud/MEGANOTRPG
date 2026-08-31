import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { buildCharacterPreparationModel } from "../src/lib/characterPreparation.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync("supabase/migrations/20260830022000_post_rest_preparation_runtime.sql", "utf8")
const spellPreparationSql = fs.readFileSync("supabase/migrations/20260830024000_chat_spell_preparation_commit.sql", "utf8")
const card = fs.readFileSync("src/components/chat/ChatPreparationCard.tsx", "utf8")
const preparationHook = fs.readFileSync("src/hooks/useChatPreparation.ts", "utf8")
const resolvedCharacterRuntime = fs.readFileSync("src/hooks/useResolvedCharacterRuntime.ts", "utf8")
const characterRuntimeSource = fs.readFileSync("src/engine-runtime/supabaseCharacterRuntimeSource.ts", "utf8")
const characterRuntimeResolver = fs.readFileSync("src/engine-runtime/resolveCharacterRuntime.ts", "utf8")

const druidTemplate: RuleTemplate = {
  id: "druid-template",
  campaign_id: "campaign",
  kind: "class",
  slug: "druid",
  name: "Друид",
  description: "Друид готовит заклинания после долгого отдыха.",
  version: 1,
  mechanics: [{
    id: "druid-spellcasting",
    type: "grant",
    target: "feature",
    key: "class:druid:spellcasting",
    sourceKey: "spellcasting",
    payload: { label: "Заклинания друида", description: "После долгого отдыха друид выбирает новый список подготовленных заклинаний." },
  }],
  choices: [],
  parent_template_id: null,
  unlock_level: null,
  catalog_key: "class:druid",
  catalog_revision: "post-rest-test",
  source_kind: "official",
  source_label: "Official",
  is_builtin: true,
  mechanical_summary: "Подготовленные заклинания обновляются в серверном окне долгого отдыха.",
  author_description: "",
  author_comment: "",
  rules_meta: {
    spell_preparation_refresh: "long_rest",
    sheet_profile: { prepared_spells_by_level: { "4": 7 } },
    post_rest_preparations: [],
  },
  is_active: true,
  created_by: null,
  created_at: "2026-08-30T00:00:00Z",
  updated_at: "2026-08-30T00:00:00Z",
}

function druidBundle(): CharacterTemplateBundle {
  return {
    template: druidTemplate,
    assignment: {
      id: "druid-assignment",
      character_id: "hero",
      template_id: druidTemplate.id,
      template_level: 4,
      selected_choices: {},
      assigned_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    levels: [],
  }
}

function engineInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "hero",
      name: "Друид",
      level: 4,
      abilities: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 18, charisma: 8 },
      baseMaxHp: 32,
      baseSpeed: 30,
    },
    state: { currentHp: 32, tempHp: 0 },
    contributions,
  }
}

test("long rest opens one server-authoritative preparation generation", () => {
  assert.match(migration, /create table if not exists public\.character_preparation_sessions/)
  assert.match(migration, /generation=public\.character_preparation_sessions\.generation\+1/)
  assert.match(migration, /is_open=true/)
  assert.match(migration, /opened_by=auth\.uid\(\)/)
})

test("only ordinary assigned-player text closes preparation", () => {
  assert.match(migration, /private\.close_character_preparation_from_chat/)
  assert.match(migration, /new\.event_kind is not null/)
  assert.match(migration, /nullif\(btrim\(coalesce\(new\.body,''\)\),''\) is null/)
  assert.match(migration, /c\.character_type='pc'/)
  assert.match(migration, /c\.assigned_user_id=new\.user_id/)
})

test("daily roll results are one record per long rest and can explicitly feed resources", () => {
  assert.match(migration, /character_preparation_records/)
  assert.match(migration, /unique\(character_id,generation,assignment_id,task_key\)/)
  assert.match(migration, /record_character_post_rest_value_v1/)
  assert.match(migration, /coalesce\(v_output->>'kind','stored_value'\)='resource'/)
  assert.match(migration, /max_and_current/)
})

test("finished prepared casters and Circle of the Land opt into long-rest policies", () => {
  const sources = [
    fs.readFileSync("supabase/migrations/20260827170000_druid_base_mechanics_v2.sql", "utf8"),
    fs.readFileSync("supabase/migrations/20260830010000_cleric_runtime_completion.sql", "utf8"),
    fs.readFileSync("supabase/migrations/20260830022000_post_rest_preparation_runtime.sql", "utf8"),
  ].join("\n")
  assert.match(sources, /spell_preparation_refresh/)
  assert.match(sources, /post_rest_preparations/)
  assert.match(sources, /land/i)
})

test("Cosmic Omen records parity and server-gates the sibling action", () => {
  assert.match(migration, /parity/)
  assert.match(migration, /even/)
  assert.match(migration, /odd/)
  assert.match(migration, /resolved_value/)
})

test("post-rest class package still passes quality/resource gates and reaches CE", () => {
  const packages = [druidBundle()]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  const parsed = resolveTemplateBundles(packages, 4)
  assert.ok(parsed.contributions.length > 0)
  assert.doesNotThrow(() => resolveCharacterContract(engineInput(parsed.contributions)))
})

test("CE read model suppresses both daily actions before roll and only the wrong sibling after it", () => {
  assert.match(characterRuntimeResolver, /resolveLegacyCharacterEngineView/)
  assert.match(characterRuntimeResolver, /preparation/i)
})

test("chat owns atomic personal spell preparation and persists Ready state", () => {
  assert.match(spellPreparationSql, /commit_character_spell_preparation_v1/)
  assert.match(spellPreparationSql, /character_preparation_records/)
  assert.match(spellPreparationSql, /v_task_key:='spells:' \|\| v_template\.id::text/)
})

test("spell preparation is performed inside chat instead of redirecting to the sheet", () => {
  assert.match(card, /commit_character_spell_preparation_v1/)
  assert.match(card, /p_prepared_spell_ids: draft/)
  assert.match(card, /"Готово"/)
  assert.doesNotMatch(card, /Открыть заклинания персонажа/)
})

test("spell changes refresh both preparation UI and the shared CE runtime bridge", () => {
  assert.match(preparationHook, /table: "character_spells"/)
  assert.match(preparationHook, /select\("id,catalog_spell_id,name,spell_level,prepared,cast_mode"\)/)
  assert.match(resolvedCharacterRuntime, /table: "character_spells"/)
  assert.match(characterRuntimeSource, /from\("character_spells"\)/)
  assert.match(characterRuntimeResolver, /resolveLegacyCharacterEngineView\(\{/)
  assert.match(characterRuntimeResolver, /spells: core\.spells/)
})

test("chat preparation card warns that text closes the window while rolls do not", () => {
  assert.match(card, /Первый отправленный текст закроет это окно/)
  assert.match(card, /Броски, способности и заклинания окно не закрывают/)
  assert.match(card, /Бросить \$\{notation\} и записать/)
})

test("preparation model remains server-session driven", () => {
  const model = buildCharacterPreparationModel([druidBundle()], 4, { character_id: "hero", generation: 1, is_open: true, opened_at: "2026-08-30T00:00:00Z", opened_by: "gm", closed_at: null, closed_by_message_id: null, updated_at: "2026-08-30T00:00:00Z" }, [])
  assert.equal(model.isOpen, true)
})
