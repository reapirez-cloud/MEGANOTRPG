import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const characterView = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)
const biography = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetBiography.tsx",
  "utf8",
)
const biographyHook = fs.readFileSync(
  "src/ui-v1-isolated/useCharacterBiography.ts",
  "utf8",
)
const biographyCss = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-biography.css",
  "utf8",
)
const managerTools = fs.readFileSync(
  "supabase/functions/voss-agent/manager-tools.ts",
  "utf8",
)
const readTools = fs.readFileSync(
  "supabase/functions/voss-agent/read-tools.ts",
  "utf8",
)
const index = fs.readFileSync(
  "supabase/functions/voss-agent/index.ts",
  "utf8",
)
const factionMigration = fs.readFileSync(
  "supabase/migrations/20260922213719_character_biography_stage4_factions_v1.sql",
  "utf8",
)
const revisionMigration = fs.readFileSync(
  "supabase/migrations/20260922214338_character_biography_stage4_realtime_revision_v1.sql",
  "utf8",
)

test("character sheet biography replaces the stage placeholder", () => {
  assert.match(characterView, /import CharacterSheetBiography/)
  assert.match(characterView, /section === "biography"/)
  assert.match(characterView, /<CharacterSheetBiography/)
  assert.match(characterView, /useCharacterBiography/)
})

test("biography UI contains history relationships factions and property", () => {
  for (const label of ["История", "Связи", "Фракции", "Имущество"]) {
    assert.match(biography, new RegExp(label))
  }
  assert.match(biographyCss, /u1-character-biography__tabs/)
  assert.match(biographyCss, /u1-biography-relationship/)
  assert.match(biographyCss, /u1-biography-faction/)
  assert.match(biographyCss, /u1-biography-asset/)
})

test("biography reads use player-safe and manager RPCs", () => {
  assert.match(biographyHook, /read_character_biography_v1/)
  assert.match(biographyHook, /read_character_biography_manager_v1/)
  assert.match(biographyHook, /character_biography_revisions/)
})

test("stage 4 creates canonical factions memberships and dynamic reputation", () => {
  assert.match(factionMigration, /create table public\.factions/i)
  assert.match(factionMigration, /create table public\.faction_memberships/i)
  assert.match(factionMigration, /create table public\.character_faction_reputations/i)
  assert.match(factionMigration, /reputation_score between -100 and 100/i)
  assert.match(factionMigration, /set_character_faction_reputation_v1/i)
  assert.match(factionMigration, /set_faction_membership_v1/i)
  assert.match(factionMigration, /upsert_faction_v1/i)
})

test("legacy NPC faction strings are materialized into canonical faction membership", () => {
  assert.match(
    factionMigration,
    /insert into public\.factions[\s\S]*from public\.npc_profiles/i,
  )
  assert.match(
    factionMigration,
    /insert into public\.faction_memberships[\s\S]*from public\.npc_profiles/i,
  )
})

test("safe revision channel carries change signals without GM notes", () => {
  assert.match(revisionMigration, /create table public\.character_biography_revisions/i)
  assert.match(revisionMigration, /private\.can_read_character_knowledge\(character_id\)/)
  assert.match(revisionMigration, /character_relationships_biography_revision/)
  assert.match(revisionMigration, /character_assets_biography_revision/)
  assert.match(revisionMigration, /character_faction_reputations_biography_revision/)
  assert.doesNotMatch(revisionMigration, /gm_note/)
})

test("Freddy can manage faction identity membership and reputation separately", () => {
  assert.match(managerTools, /name: "upsert_faction"/)
  assert.match(managerTools, /name: "set_faction_membership"/)
  assert.match(managerTools, /name: "set_character_faction_reputation"/)
  assert.match(readTools, /read_character_biography_manager_v1/)
  assert.match(index, /Членство во фракции и репутация/)
})
