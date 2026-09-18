import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const spells = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetSpellsStage1.tsx",
  "utf8",
)
const chatRoom = fs.readFileSync(
  "src/pages/ChatRoom.tsx",
  "utf8",
)
const chatHook = fs.readFileSync(
  "src/hooks/useChatMessages.ts",
  "utf8",
)
const classResourceRuntime = fs.readFileSync(
  "src/lib/classResourceRuntime.ts",
  "utf8",
)
const resourceRuntime = fs.readFileSync(
  "src/lib/resourceRuntime.ts",
  "utf8",
)
const entityStorage = fs.readFileSync(
  "src/entity-engine/supabase.ts",
  "utf8",
)

test("character spell sheet no longer casts or spends resources", () => {
  assert.doesNotMatch(spells, /spendResolvedClassSpellOption/)
  assert.doesNotMatch(spells, /ResolvedSpellResourceOption/)
  assert.doesNotMatch(spells, /resolvedCastChoices/)
  assert.doesNotMatch(spells, /renderCastControls/)
  assert.doesNotMatch(spells, /castSpell\s*=\s*async/)
  assert.doesNotMatch(spells, /Выбрать расход/)
  assert.doesNotMatch(spells, />Наложить</)
  assert.doesNotMatch(spells, /character-sheet-spell-casting\.css/)
})

test("chat remains the authoritative spell-casting surface", () => {
  assert.match(chatRoom, /async function executeSpell\(spell: ResolvedSpell/)
  assert.match(chatRoom, /async function castSpell\(spell: ResolvedSpell\)/)
  assert.match(chatRoom, /templateMechanicIdForSpellAccess\(access\)/)
  assert.match(chatRoom, /chat\.sendTemplateSpell\(/)
  assert.match(chatRoom, /chat\.sendEvent\(characterId, "spell"/)
  assert.match(chatRoom, /resourceCostInputs\(contract, option\.costs\)/)
  assert.match(chatHook, /sendTemplateSpell/)
})

test("persistent CE resource spending remains available to chat/runtime infrastructure", () => {
  assert.match(classResourceRuntime, /resourceCostInputs\(contract, option\.costs\)/)
  assert.match(classResourceRuntime, /spend_character_resources/)
  assert.match(resourceRuntime, /including spell slots/)
  assert.match(entityStorage, /grant_character_long_rest/)
  assert.match(entityStorage, /grant_character_short_rest/)
  assert.match(entityStorage, /recover_character_resources/)
})

test("grimoire keeps preparation management without becoming a casting surface", () => {
  assert.match(spells, /className="u1-character-spells__grimoire-panel"/)
  assert.match(spells, /className="u1-character-spells__prepare-toggle"/)
  assert.match(spells, /await onSetPrepared\(spellId, nextPrepared\)/)
  assert.doesNotMatch(spells, /u1-character-spells__cast-primary/)
  assert.doesNotMatch(spells, /u1-character-spells__cast-options/)
})
