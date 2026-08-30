import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { buildCharacterPreparationModel } from "../src/lib/characterPreparation.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const runtimeSql = fs.readFileSync("supabase/migrations/20260830022000_post_rest_preparation_runtime.sql", "utf8")
const classSql = fs.readFileSync("supabase/migrations/20260830023000_long_rest_choice_and_druid_preparation.sql", "utf8")
const card = fs.readFileSync("src/components/chat/ChatPreparationCard.tsx", "utf8")

function starsBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-stars",
      character_id: "character-1",
      template_id: "template-stars",
      template_level: 6,
      selected_choices: {},
      assigned_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    template: {
      id: "template-stars",
      campaign_id: "campaign-1",
      kind: "subclass",
      slug: "druid-circle-stars",
      name: "Круг Звёзд",
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: "template-druid",
      unlock_level: 3,
      rules_meta: {
        post_rest_preparations: [{
          key: "cosmic-omen-sign",
          label: "Космическое знамение",
          trigger: "long_rest",
          unlockLevel: 6,
          input: { kind: "roll", count: 1, sides: 6 },
          actionSourceKeys: { weal: "cosmic-omen-weal", woe: "cosmic-omen-woe" },
        }],
      },
      is_active: true,
      created_by: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    levels: [],
  }
}

function druidBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-druid",
      character_id: "character-1",
      template_id: "template-druid",
      template_level: 6,
      selected_choices: {},
      assigned_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    template: {
      id: "template-druid",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "druid",
      name: "Друид",
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      rules_meta: { spell_preparation_refresh: "long_rest" },
      is_active: true,
      created_by: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    levels: [],
  }
}

test("long rest opens one server-authoritative preparation generation", () => {
  assert.match(runtimeSql, /character_preparation_sessions/)
  assert.match(runtimeSql, /generation=public\.character_preparation_sessions\.generation\+1/)
  assert.match(runtimeSql, /is_open=true/)
  assert.match(runtimeSql, /perform public\.recover_character_resources\(p_character_id,'long_rest'\)/)
})

test("only ordinary assigned-player text closes preparation", () => {
  assert.match(runtimeSql, /new\.event_kind is not null/)
  assert.match(runtimeSql, /nullif\(btrim\(coalesce\(new\.body,''\)\),''\) is null/)
  assert.match(runtimeSql, /c\.assigned_user_id=new\.user_id/)
  assert.match(runtimeSql, /c\.character_type='pc'/)
  assert.match(runtimeSql, /closed_by_message_id=new\.id/)
  assert.match(runtimeSql, /spell_change_unlocked=false/)
})

test("daily roll results are one record per long rest and can explicitly feed resources", () => {
  assert.match(runtimeSql, /unique\(character_id,generation,assignment_id,task_key\)/)
  assert.match(runtimeSql, /Preparation value is already recorded for this long rest/)
  assert.match(runtimeSql, /send_chat_preparation_roll_v1/)
  assert.match(runtimeSql, /preparationRecord/)
  assert.match(runtimeSql, /coalesce\(v_output->>'kind','stored_value'\)='resource'/)
})

test("finished prepared casters and Circle of the Land opt into long-rest policies", () => {
  assert.match(classSql, /catalog_key in \('class:druid','class:cleric'\)/)
  assert.match(classSql, /spell_preparation_refresh','long_rest'/)
  assert.match(classSql, /'selection_mode','player_once','refresh','long_rest'/)
  assert.match(classSql, /v_can_replace:=v_refresh='long_rest' and private\.is_character_preparation_open/)
})

test("Cosmic Omen records parity and server-gates the sibling action", () => {
  assert.match(classSql, /'odd','woe','even','weal'/)
  assert.match(classSql, /'weal','stars-cosmic-weal','woe','stars-cosmic-woe'/)
  assert.match(classSql, /assert_character_template_preparation_action/)
  assert.match(classSql, /This action is not available for the current daily preparation/)
})

test("CE read model suppresses both daily actions before roll and only the wrong sibling after it", () => {
  const session = {
    character_id: "character-1",
    generation: 2,
    is_open: true,
    opened_at: null,
    opened_by: null,
    closed_at: null,
    closed_by_message_id: null,
  }
  const bundles = [druidBundle(), starsBundle()]
  const before = buildCharacterPreparationModel(bundles, 6, session, [])
  assert.deepEqual(before.suppressedSourceIds, [
    "template:subclass:template-stars:v1:source:cosmic-omen-weal",
    "template:subclass:template-stars:v1:source:cosmic-omen-woe",
  ])
  assert.equal(before.tasks.some((task) => task.kind === "spells"), true)
  assert.equal(before.tasks.some((task) => task.kind === "roll" && task.key === "cosmic-omen-sign"), true)

  const after = buildCharacterPreparationModel(bundles, 6, session, [{
    id: "record-1",
    character_id: "character-1",
    generation: 2,
    assignment_id: "assignment-stars",
    task_key: "cosmic-omen-sign",
    input_value: 4,
    resolved_value: "weal",
  }])
  assert.deepEqual(after.suppressedSourceIds, [
    "template:subclass:template-stars:v1:source:cosmic-omen-woe",
  ])
})

test("chat preparation card warns that text closes the window while rolls do not", () => {
  assert.match(card, /Первый отправленный текст закроет это окно/)
  assert.match(card, /Броски, способности и заклинания окно не закрывают/)
  assert.match(card, /Бросить \{notation\} и записать/)
})
