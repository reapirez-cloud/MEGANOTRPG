import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const stage6 = fs.readFileSync(
  "supabase/migrations/20260909090000_sorcerer_stage6_spell_runtime_v1.sql",
  "utf8",
)
const gateway = fs.readFileSync("src/game-engine/supabase.ts", "utf8")

test("Sorcerer Stage 6 installs a persistent 2024 spell choice instead of Long Rest preparation", () => {
  assert.match(stage6, /'key','sorcerer_cantrips'/)
  assert.match(stage6, /'key','sorcerer_prepared_spells'/)
  assert.match(stage6, /'selection_mode','player_once'/)
  assert.match(stage6, /'replacement_policy','on_level_change'/)
  assert.match(stage6, /'replacement_limit',1/)
  assert.doesNotMatch(stage6, /commit_character_spell_preparation_v1/)
})

test("Sorcerer Stage 6 carries the 2024 cantrip and prepared-spell progressions", () => {
  assert.match(stage6, /'count_by_level',jsonb_build_object\('1',4,'4',5,'10',6\)/)
  assert.match(stage6, /'1',2,'2',4,'3',6,'4',7,'5',9,'6',10,'7',11,'8',12,'9',14,'10',15/)
  assert.match(stage6, /'11',16,'12',16,'13',17,'14',17,'15',18,'16',18,'17',19,'18',20,'19',21,'20',22/)
  assert.match(stage6, /when 9 then 17/)
})

test("Sorcerer Stage 6 emits Charisma class-spell methods backed by the shared slot ledger", () => {
  assert.match(stage6, /'kind','class_spell'/)
  assert.match(stage6, /'ability','charisma'/)
  assert.match(stage6, /abilities\.charisma\.modifier/)
  assert.match(stage6, /private\.class_spell_slot_options\(v_spell\.spell_level\)/)
  assert.match(stage6, /if v_spell\.spell_level > 0 then/)
  assert.match(stage6, /perform private\.sync_sorcerer_spell_slots_stage3_v1/)
})

test("Sorcerer Stage 6 publishes catalog links and declares the deployed revision", () => {
  assert.match(stage6, /private\.sync_rule_template_spell_links\(v_sorcerer\)/)
  assert.match(stage6, /xphb-2024-sorcerer-stage6-spell-runtime-v1/)
  assert.match(stage6, /STAGE6_SPELL_RUNTIME_READY/)
  assert.match(stage6, /trg_install_sorcerer_stage6_spell_runtime_for_campaign/)
  assert.match(stage6, /SORCERER_STAGE6_LINK_PARITY_INVALID/)
})

test("Metamagic casts use the Stage 5+ v2 atomic runtime", () => {
  const method = gateway.match(/async sendSpellWithModifiers[\s\S]*?\n  }/)
  assert.ok(method, "GENA gateway must expose sendSpellWithModifiers")
  assert.match(method[0], /send_chat_spell_with_template_modifiers_v2/)
  assert.doesNotMatch(method[0], /send_chat_spell_with_template_modifiers_v1/)
})
