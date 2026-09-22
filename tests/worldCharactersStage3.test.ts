import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sectionScreens = fs.readFileSync(
  "src/ui-v1-isolated/SectionScreens.tsx",
  "utf8",
)
const sectionData = fs.readFileSync(
  "src/ui-v1-isolated/useUiV1SectionData.ts",
  "utf8",
)
const css = fs.readFileSync(
  "src/ui-v1-isolated/section-screens.css",
  "utf8",
)
const migration = fs.readFileSync(
  "supabase/migrations/20260922212108_world_characters_ui_stage3_v1.sql",
  "utf8",
)

test("world characters render as 9:16 portrait cards instead of simple rows", () => {
  assert.match(sectionScreens, /function WorldCharacterCard/)
  assert.match(sectionScreens, /u1-world-character-grid/)
  assert.match(sectionScreens, /u1-world-character-card__portrait/)
  assert.match(css, /\.u1-world-character-card__portrait[\s\S]*aspect-ratio:\s*9\s*\/\s*16/)
  assert.doesNotMatch(
    sectionScreens,
    /subsection === "characters"[\s\S]{0,500}<article className="u1-simple-row"/,
  )
})

test("world NPC cards open a dedicated dossier route", () => {
  assert.match(
    sectionScreens,
    /navigate\(\`home\/world\/characters\/\$\{item\.id\}\`\)/,
  )
  assert.match(sectionScreens, /function WorldNpcDossierScreen/)
  assert.match(sectionScreens, /path\[0\][\s\S]*WorldNpcDossierScreen/)
})

test("NPC dossier exposes D&D essentials and relationship state", () => {
  for (const token of [
    "armor_class",
    "current_hp",
    "max_hp",
    "initiative_bonus",
    "speed",
    "proficiency_bonus",
    "passive_perception",
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
    "relationship",
  ]) {
    assert.match(sectionScreens + sectionData + migration, new RegExp(token))
  }
})

test("player-safe world NPC read models use canonical visibility and hide GM data", () => {
  assert.match(migration, /private\.can_view_character\(c\.id, v_user_id\)/)
  assert.match(migration, /private\.can_view_location\(l\.id, v_user_id\)/)
  assert.match(migration, /v_can_manage or r\.player_visible/)
  assert.match(migration, /'manager',[\s\S]*case when v_can_manage/)
  assert.match(migration, /'gm_notes'/)
  assert.match(migration, /'motivation'/)
})

test("world NPC data refreshes when canonical NPC state changes", () => {
  for (const table of [
    "npc_profiles",
    "character_relationships",
    "character_world_state",
    "character_npc_discoveries",
  ]) {
    assert.match(sectionData, new RegExp(`table: "${table}"`))
  }
})

test("world NPC faction remains visible metadata, not fabricated relationship state", () => {
  assert.match(sectionData, /faction: string/)
  assert.match(sectionScreens, /profile\.faction/)
  assert.doesNotMatch(sectionData, /faction_attitude|faction_relationship/)
})
