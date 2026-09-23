import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260923130000_ai_gm_media_stage9_v1.sql",
)
const worker = read("supabase/functions/ai-gm-media/index.ts")
const imageTools = read("supabase/functions/voss-agent/image-tools.ts")
const roadmap = read("docs/AI_GM_ROADMAP.md")

test("Stage 9 queues NPC art from canonical NPC profile creation", () => {
  assert.match(migration, /queue_ai_gm_npc_media_after_profile_v1/)
  assert.match(migration, /after insert on public\.npc_profiles/)
  assert.match(
    migration,
    /'character',new\.character_id,'npc_create',null/,
  )
  assert.match(migration, /v_target_field:='avatar_url'/)
  assert.match(migration, /v_purpose:='portrait'/)
})

test("Stage 9 queues location art only on actual PC location entry", () => {
  assert.match(migration, /queue_ai_gm_location_media_after_entry_v1/)
  assert.match(
    migration,
    /after insert or update of location_id[\s\S]*on public\.character_world_state/,
  )
  assert.match(migration, /if v_type<>'pc' then return new; end if;/)
  assert.match(
    migration,
    /'location',new\.location_id,'location_first_visit',new\.character_id/,
  )
  assert.match(migration, /v_target_field:='image_url'/)
  assert.match(migration, /v_purpose:='hero_art'/)
})

test("Stage 9 reservations are idempotent and retryable", () => {
  assert.match(
    migration,
    /primary key\(target_type,target_id,target_field\)/,
  )
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(
    migration,
    /v_lifecycle\.status in \('queued','running','completed'\)/,
  )
  assert.match(migration, /retry_ai_gm_media_target_v1/)
  assert.match(migration, /status not in \('failed','cancelled'\)/)
})

test("Stage 9 dispatch is token protected and service-only", () => {
  assert.match(migration, /private\.ai_gm_media_dispatch_config/)
  assert.match(migration, /verify_ai_gm_media_dispatch_v1/)
  assert.match(migration, /length\(coalesce\(p_token,''\)\) >= 32/)
  assert.match(migration, /\/functions\/v1\/ai-gm-media/)
  assert.match(
    migration,
    /grant execute on function public\.dispatch_ai_gm_media_job_v1\(uuid\)[\s\S]*to service_role/,
  )
  assert.match(
    migration,
    /grant execute on function public\.finalize_ai_gm_media_lifecycle_v1\(uuid\)[\s\S]*to service_role/,
  )
})

test("Stage 9 worker reuses the existing image engine", () => {
  assert.match(worker, /processAgentImageJob/)
  assert.match(worker, /verify_ai_gm_media_dispatch_v1/)
  assert.match(worker, /finalize_ai_gm_media_lifecycle_v1/)
  assert.match(worker, /agent_key", "ai-gm-media-worker"/)
  assert.match(worker, /surface: "ai_gm_media_stage9_v1"/)
})

test("Stage 9 makes shared image-job claiming atomic", () => {
  const start = imageTools.indexOf(
    "export async function processAgentImageJob",
  )
  assert.ok(start >= 0)
  const code = imageTools.slice(start, start + 2200)
  assert.match(code, /job\.status !== "queued"/)
  assert.match(code, /\.eq\("status", "queued"\)/)
  assert.match(code, /\.select\("id"\)/)
  assert.match(code, /if \(!claimed\?\.id\) return/)
})

test("Stage 9 generated media attaches through canonical media bindings", () => {
  assert.match(migration, /'attach_when_ready',true/)
  assert.match(migration, /public\.media_bindings/)
  assert.match(migration, /a\.status='attached'/)
  assert.match(migration, /generated_asset_not_attached/)
  assert.doesNotMatch(
    migration,
    /update public\.characters[\s\S]*set avatar_url/,
  )
  assert.doesNotMatch(
    migration,
    /update public\.locations[\s\S]*set image_url/,
  )
})

test("Stage 9 publishes media into active game scenes exactly once", () => {
  assert.match(migration, /private\.ai_gm_media_publications/)
  assert.match(migration, /primary key\(asset_id,room_id\)/)
  assert.match(migration, /attachment_url,attachment_kind,event_payload/)
  assert.match(migration, /'image'/)
  assert.match(migration, /'systemEvent','ai_gm_media'/)
  assert.match(migration, /'runtimeStage',9/)
  assert.match(migration, /r\.room_type='scene'/)
  assert.match(migration, /r\.scene_state='active'/)
  assert.match(migration, /r\.location_id=v_location_id/)
})

test("Stage 9 NPC art respects canonical visibility before chat publication", () => {
  assert.match(migration, /if v_visibility_mode='always' then/)
  assert.match(migration, /public\.character_npc_discoveries/)
  assert.match(migration, /d\.npc_character_id=p_target_id/)
  assert.match(migration, /publish_ai_gm_npc_media_after_discovery_v1/)
  assert.match(
    migration,
    /after insert on public\.character_npc_discoveries/,
  )
})

test("Stage 9 republishes existing art when a PC enters a scene later", () => {
  assert.match(
    migration,
    /publish_existing_ai_gm_target_media_v1\([\s\S]*'location',new\.location_id,new\.character_id/,
  )
  assert.match(migration, /for v_npc_id in/)
  assert.match(migration, /ws\.location_id=new\.location_id/)
  assert.match(
    migration,
    /'character',v_npc_id,new\.character_id/,
  )
})

test("Stage 9 intentionally does not automate item art", () => {
  assert.doesNotMatch(migration, /character_inventory_items/)
  assert.doesNotMatch(migration, /item_definition/)
  assert.doesNotMatch(migration, /trigger_kind[^\n]*item/)
})

test("Stage 9 private lifecycle tables enable RLS", () => {
  assert.match(
    migration,
    /alter table private\.ai_gm_media_lifecycle enable row level security/,
  )
  assert.match(
    migration,
    /alter table private\.ai_gm_media_publications enable row level security/,
  )
  assert.match(
    migration,
    /alter table private\.ai_gm_media_dispatch_config enable row level security/,
  )
})

test("Stage 9 roadmap remains in progress until live certification", () => {
  assert.match(
    roadmap,
    /\| 9 \| IN PROGRESS \| NPC\/location art lifecycle and chat media publication \|/,
  )
  assert.match(roadmap, /Stage 9 is IN PROGRESS/)
})
