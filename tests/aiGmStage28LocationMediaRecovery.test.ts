import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260925110000_ai_gm_stage28_location_media_recovery_v1.sql",
)
const locations = read("src/ui-v1-isolated/useUiV1Locations.ts")
const navigator = read("src/ui-v1-isolated/LocationNavigator.tsx")
const css = read("src/ui-v1-isolated/section-screens.css")
const roadmap = read("docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md")

test("Stage 28 enables and recovers the protected media dispatcher", () => {
  assert.match(migration, /ai_gm_media_dispatch_config/)
  assert.match(
    migration,
    /enabled=\(nullif\(trim\(project_url\),''\) is not null\)/,
  )
  assert.match(migration, /dispatch_attempts/)
  assert.match(migration, /last_dispatch_at/)
  assert.match(migration, /recover_ai_gm_media_target_v2/)
  assert.match(migration, /recover_ai_gm_media_queue_core_v2/)
  assert.match(migration, /15 minutes/)
})

test("Stage 28 keeps client recovery scoped and token-free", () => {
  assert.match(migration, /poke_ai_gm_media_recovery_v1/)
  assert.match(migration, /campaign_member_required/)
  assert.match(migration, /retry_ai_gm_location_media_v1/)
  assert.match(migration, /campaign_manager_required/)
  assert.doesNotMatch(locations, /dispatch_token/)
})

test("Stage 28 location UI reads canonical media bindings", () => {
  assert.match(migration, /public\.media_bindings/)
  assert.match(migration, /a\.status='attached'/)
  assert.match(migration, /coalesce\(media\.storage_path/)
  assert.match(locations, /list_ai_gm_location_media_states_v1/)
  assert.match(locations, /media_path/)
  assert.match(locations, /resolveCampaignMediaUrl\(mediaPath\)/)
})

test("Stage 28 renders a persistent 16:9 location hero", () => {
  assert.match(navigator, /u1-entity-detail__hero/)
  assert.match(navigator, /data-media-status/)
  assert.match(navigator, /Повторить генерацию/)
  assert.match(navigator, /Арт появится после первого посещения/)
  assert.match(css, /aspect-ratio: 16 \/ 9/)
  assert.match(css, /u1-entity-detail__hero-placeholder/)
  assert.match(css, /u1-location-media-pulse/)
})

test("Stage 28 reconciles already occupied AI-world locations", () => {
  assert.match(migration, /public\.character_world_state/)
  assert.match(migration, /private\.is_ai_world_campaign_v1/)
  assert.match(migration, /location_first_visit/)
  assert.match(migration, /recover_ai_gm_media_queue_core_v2\(null,100\)/)
})

test("Stage 27 is READY and Stage 28 is recorded", () => {
  assert.match(
    roadmap,
    /## Stage 27 — Deterministic Executor \+ Inventory Commit[\s\S]*\*\*Status: READY/,
  )
  assert.match(
    roadmap,
    /## Stage 28 — Location Media Recovery \+ Causal Certification[\s\S]*\*\*Status: READY/,
  )
})
