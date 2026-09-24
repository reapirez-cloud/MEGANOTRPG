import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/20260924055547_ai_world_evolution_stage15_promotion_handoff_and_party_sync_v1.sql", import.meta.url),
  "utf8",
)
const stage8 = readFileSync(
  new URL("../supabase/migrations/20260923194814_ai_world_evolution_stage8_scene_actor_promotion_v1.sql", import.meta.url),
  "utf8",
)
const stage9 = readFileSync(
  new URL("../supabase/migrations/20260923204623_ai_world_evolution_stage9_daily_candidate_resolver_v1.sql", import.meta.url),
  "utf8",
)
const context = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-context.ts", import.meta.url),
  "utf8",
)
const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("stage 15 contract is certified", () => {
  const stage15 = contract.slice(
    contract.indexOf('id: 15,'),
    contract.indexOf('id: 16,'),
  )
  assert.match(stage15, /status: "certified"/)
})

test("promotion handoff makes named NPC background-simulation eligible", () => {
  assert.match(
    migration,
    /background_simulation_scope='entity'/,
  )
  assert.match(migration, /ai_scene_actor_stage15_background_handoff/)
  assert.match(migration, /backgroundSimulationEligible/)
  assert.match(stage8, /runtime_state='archived'/)
  assert.match(stage8, /archive_reason='promoted'/)
})

test("promotion seeds compact background state with encounter provenance", () => {
  assert.match(migration, /stage15:promotion:/)
  assert.match(migration, /'source_kind','scene_actor_promotion'/)
  assert.match(migration, /'encounter_handoff'/)
  assert.match(migration, /'current_hp',new\.current_hp/)
  assert.match(migration, /'resources',v_resources/)
  assert.match(migration, /'conditions',new\.conditions/)
  assert.match(migration, /provenance->>'stage'='15'/)
})

test("only persistent NPC rows enter daily Resolver candidate pool", () => {
  assert.match(stage9, /from public\.npc_profiles np/)
  assert.match(stage9, /join public\.characters c/)
  assert.doesNotMatch(stage9, /from public\.ai_scene_actors/)
})

test("promotion bootstrap snapshot may exist without a daily run only for stage 15", () => {
  assert.match(migration, /alter column run_id drop not null/)
  assert.match(
    migration,
    /run_id is not null or provenance->>'stage'='15'/,
  )
  assert.match(migration, /ai_background_stage15_bootstrap_key_uidx/)
})

test("colocated PCs converge to the later game time with idle-only catchup", () => {
  assert.match(migration, /sync_colocated_player_time_v1/)
  assert.match(
    migration,
    /order by ws\.campaign_day desc,[\s\S]*ai_day_period_rank_v1\(ws\.day_period\) desc/,
  )
  assert.match(migration, /catchup_kind text not null default 'idle_life'/)
  assert.match(migration, /meaningful_actions boolean not null default false/)
  assert.match(migration, /'major_successes',false/)
  assert.match(migration, /'offscreen_heroics',false/)
})

test("party time convergence changes only world time, not character mechanics", () => {
  const syncStart = migration.indexOf(
    "create or replace function private.sync_colocated_player_time_v1",
  )
  const syncEnd = migration.indexOf(
    "create or replace function public.sync_colocated_player_time_v1",
  )
  const syncBody = migration.slice(syncStart, syncEnd)

  assert.match(syncBody, /update public\.character_world_state/)
  assert.doesNotMatch(syncBody, /update public\.character_sheets/)
  assert.doesNotMatch(syncBody, /character_resource_states/)
  assert.doesNotMatch(syncBody, /quest_condition_states/)
  assert.doesNotMatch(syncBody, /inventory/)
})

test("AI GM consumes and respects cooperative time sync semantics", () => {
  assert.match(context, /sync_colocated_player_time_v1/)
  assert.match(context, /ai_player_time_catchup_receipts/)
  assert.match(context, /cooperative_time_sync: context\.temporalSync/)
  assert.match(runtime, /idle_life catch-up НЕ является скрытым приключением/)
  assert.match(runtime, /не считается успешным/)
})

test("party sync remains isolated to AI-world campaigns and service role", () => {
  assert.match(migration, /not private\.is_ai_world_campaign_v1\(p_campaign_id\)/)
  assert.match(
    migration,
    /revoke all on function public\.sync_colocated_player_time_v1\(uuid,uuid\)[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function public\.sync_colocated_player_time_v1\(uuid,uuid\)[\s\S]*to service_role/,
  )
})
