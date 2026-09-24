import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const manager = read("supabase/functions/voss-agent/manager-tools.ts")
const broker = read("supabase/functions/voss-agent/capability-broker.ts")
const index = read("supabase/functions/voss-agent/index.ts")
const voice = read("supabase/functions/voss-agent/freddy-voice.ts")

test("characters.write publishes the complete character mutation surface", () => {
  for (const tool of [
    "update_campaign_character",
    "set_character_spell",
    "set_character_template_assignment",
    "commit_character_template_choice",
    "remove_character_template_assignment",
    "upsert_character_feature",
    "delete_character_feature",
    "set_character_resource_state",
    "create_character_inventory_item",
    "update_character_inventory_item",
    "remove_character_inventory_item",
    "set_character_inventory_equipped",
    "set_character_inventory_quick_access",
  ]) {
    assert.match(index, new RegExp(`"${tool}"`))
    assert.match(manager, new RegExp(`name: "${tool}"`))
  }
})

test("campaign character update can patch the full sheet", () => {
  assert.match(manager, /name: "update_campaign_character"[\s\S]*sheet:[\s\S]*CHARACTER_SHEET_PROPERTIES/)
  for (const field of [
    "race",
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
    "max_hp",
    "current_hp",
    "spellcasting_enabled",
    "spell_slots",
    "runtime_facts",
  ]) {
    assert.match(manager, new RegExp(`${field}:`))
  }
  assert.match(manager, /from\("character_sheets"\)[\s\S]*\.upsert\(/)
})

test("spells, choices and inventory use canonical engines instead of blind copies", () => {
  assert.match(manager, /from\("spell_catalog"\)/)
  assert.match(manager, /from\("character_spells"\)/)
  assert.match(manager, /"set_character_template_assignment_owner_v1"/)
  assert.match(manager, /"commit_character_template_choice_v2"/)
  assert.match(manager, /"remove_character_template_assignment_v2"/)
  assert.match(manager, /"create_inventory_item_v3"/)
  assert.match(manager, /"update_inventory_item_v3"/)
  assert.match(manager, /"remove_inventory_item_v1"/)
  assert.match(manager, /"set_inventory_item_equipped_v2"/)
  assert.match(manager, /"set_inventory_quick_access_v1"/)
})

test("Freddy is explicitly told that characters.write is full character authority", () => {
  assert.match(broker, /characters\.write = full canonical PC\/NPC control/)
  assert.match(voice, /Capability characters\.write означает полный доступ/)
  assert.match(voice, /заклинания и заговоры/)
  assert.match(voice, /инвокации/)
  assert.match(voice, /инвентарь/)
})
