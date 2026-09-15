import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const snakeTypes = fs.readFileSync("src/snake-engine/types.ts", "utf8")
const player = fs.readFileSync(
  "src/ui-v1-isolated/snake/surfaces/SnakeMediaSurface.tsx",
  "utf8",
)
const actions = fs.readFileSync(
  "src/ui-v1-isolated/characterSnakeActions.ts",
  "utf8",
)
const workspace = fs.readFileSync("src/ui-v1-isolated/Workspace.tsx", "utf8")
const workspaceData = fs.readFileSync(
  "src/ui-v1-isolated/useWorkspaceData.ts",
  "utf8",
)
const migration = fs.readFileSync(
  "supabase/migrations/20260915193000_universal_media_presentations.sql",
  "utf8",
)
const contract = fs.readFileSync(
  "docs/SNAKE_INTERACTION_CONTRACT.md",
  "utf8",
)
const agents = fs.readFileSync("AGENTS.md", "utf8")

test("Snake media surface owns target-aware graphic composition", () => {
  assert.match(snakeTypes, /SnakeMediaComposeTarget/)
  assert.match(snakeTypes, /shape: MediaPresentationShape/)
  assert.match(snakeTypes, /initialPresentation\?: MediaPresentation/)
  assert.match(player, /data-compose=/)
  assert.match(player, /u1-snake-media__compose-frame/)
  assert.match(player, /currentPresentation/)
  assert.match(player, /cropWidth/)
  assert.match(player, /cropHeight/)
  assert.match(player, /sourceWidth: naturalSize\.width/)
  assert.match(player, /presentation: currentPresentation/)
})

test("character and panel avatar actions use the same media player instead of placeholders", () => {
  assert.doesNotMatch(actions, /kind: "placeholder"/)
  assert.match(actions, /id: "character-avatar"[\s\S]*kind: "media"/)
  assert.match(actions, /shape: "circle"[\s\S]*aspectRatio: 1/)
  assert.match(
    actions,
    /id: "panel-avatar"[\s\S]*shape: "rect"[\s\S]*aspectRatio: 3/,
  )
  assert.match(workspace, /CampaignMediaFrame/)
  assert.match(workspace, /applyMedia=\{data\.applyCharacterMedia\}/)\n  assert.match(actions, /id: "sheet-hero"[\\s\\S]*aspectRatio: 16 \\/ 9/)
})

test("media presentation persists normalized crop metadata without destructive image copies", () => {
  assert.match(migration, /add column if not exists presentation jsonb/)
  assert.match(migration, /is_valid_media_presentation/)
  assert.match(migration, /register_manual_media_v1/)
  assert.match(migration, /bind_media_presentation_v1/)
  assert.match(migration, /list_character_media_presentations_v1/)
  assert.match(workspaceData, /register_manual_media_v1/)
  assert.match(workspaceData, /bind_media_presentation_v1/)\n  assert.match(workspaceData, /sheet_hero/)\n  assert.match(workspaceData, /hero_art/)
  assert.match(workspaceData, /oracle\.characters\.setAvatar/)
  assert.match(workspaceData, /shapoklyak\.execute/)
})

test("repository contract requires one Snake graphics surface for UI 1.0", () => {
  assert.match(
    contract,
    /graphic view\/crop\/fit\/apply operation goes through Snake MediaPlayer compose mode/,
  )
  assert.match(
    agents,
    /all UI 1\.0 graphic view\/crop\/fit\/apply operations use the universal Snake MediaPlayer/,
  )
})
