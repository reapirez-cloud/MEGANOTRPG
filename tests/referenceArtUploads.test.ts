import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const screen = fs.readFileSync(
  "src/ui-v1-isolated/SectionScreens.tsx",
  "utf8",
)
const runtime = fs.readFileSync(
  "src/ui-v1-isolated/useUiV1ReferenceMedia.ts",
  "utf8",
)
const migration = fs.readFileSync(
  "supabase/migrations/20260915195500_owner_reference_art_bindings.sql",
  "utf8",
)

test("reference art mutation is owner-only on both UI and database boundaries", () => {
  assert.match(runtime, /if \(!scope\.isOwner \|\| !scope\.campaignId\)/)
  assert.match(migration, /p_target_type = 'reference_art'/)
  assert.match(migration, /private\.is_campaign_owner\(p_campaign_id, p_user_id\)/)
  assert.match(migration, /target_type = 'reference_art'/)
})

test("class and subclass previews use 3:1 Snake media composition", () => {
  assert.match(screen, /classReferenceArtSlot\(entry\.id, "preview"\)/)
  assert.match(screen, /subclassReferenceArtSlot\(entry\.id, subclass\.id, "preview"\)/)
  assert.match(screen, /title: entry\.name \+ " · превью класса"[\s\S]*aspectRatio: 3/)
  assert.match(screen, /title: subclass\.name \+ " · превью"[\s\S]*aspectRatio: 3/)
})

test("class pages now have the same 16:9 hero art path as subclasses", () => {
  assert.match(screen, /classReferenceArtSlot\(entry\.id, "hero"\)/)
  assert.match(screen, /title: entry\.name \+ " · арт класса"[\s\S]*aspectRatio: 16 \/ 9/)
  assert.match(screen, /subclassReferenceArtSlot\(entry\.id, subclass\.id, "hero"\)/)
  assert.match(screen, /title: subclass\.name \+ " · арт подкласса"[\s\S]*aspectRatio: 16 \/ 9/)
})

test("reference art editing goes through Snake MediaPlayer rather than a one-off uploader", () => {
  assert.match(screen, /kind: "media"/)
  assert.match(screen, /SnakeTrigger/)
  assert.match(screen, /requireFile: !media\?\.assetId/)
  assert.match(runtime, /bind_media_presentation_v1/)
  assert.match(runtime, /p_target_type: "reference_art"/)
})
