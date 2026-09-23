import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { AI_WORLD_EVOLUTION_STAGES } from "../src/ai-world-evolution/contract.ts"

const schemaSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260923171818_ai_world_evolution_stage2_background_schema_v1.sql",
  ),
  "utf8",
)
const indexSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260923171922_ai_world_evolution_stage2_fk_indexes_v1.sql",
  ),
  "utf8",
)
const gameChatContext = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/functions/voss-agent/game-chat-context.ts",
  ),
  "utf8",
)

test("AI world evolution Stage 2 is certified only with concrete background storage", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 2)
  assert.ok(stage)
  assert.equal(stage.status, "certified")

  for (const table of [
    "ai_background_daily_runs",
    "ai_background_rolls",
    "ai_background_events",
    "ai_background_entity_snapshots",
  ]) {
    assert.match(schemaSql, new RegExp(`create table public\\.${table}`))
  }

  assert.match(schemaSql, /unique \(campaign_id, campaign_day\)/)
  assert.match(
    schemaSql,
    /resolver_receipt_id uuid not null unique references public\.ai_world_random_receipts/,
  )
  assert.match(schemaSql, /effective_game_day integer not null/)
  assert.match(schemaSql, /through_game_day integer not null/)
  assert.match(schemaSql, /campaign_event_id uuid unique references public\.campaign_events/)
})

test("Stage 2 temporal readers cannot select future background state", () => {
  assert.match(schemaSql, /through_game_day<=p_source_game_day/)
  assert.match(schemaSql, /effective_game_day<=p_source_game_day/)
  assert.match(schemaSql, /order by through_game_day desc,version desc/)
  assert.match(schemaSql, /unique \(campaign_id, entity_scope, entity_id, version\)/)
})

test("Stage 2 writes are AI-world-only and server-owned", () => {
  assert.match(schemaSql, /private\.guard_ai_background_ai_world_v1/)
  assert.match(schemaSql, /private\.is_ai_world_campaign_v1\(new\.campaign_id\)/)
  assert.match(
    schemaSql,
    /revoke all on table public\.ai_background_events from public, anon, authenticated, service_role/,
  )
  assert.match(
    schemaSql,
    /grant select on table public\.ai_background_events to service_role/,
  )
  assert.match(
    schemaSql,
    /revoke all on function public\.reserve_ai_background_daily_run_v1[\s\S]*from public,anon,authenticated/,
  )
  assert.match(
    schemaSql,
    /grant execute on function public\.reserve_ai_background_daily_run_v1[\s\S]*to service_role/,
  )
})

test("background history shares campaign_events provenance without resolving quests early", () => {
  assert.match(schemaSql, /'ai_background'/)
  assert.match(
    schemaSql,
    /if new\.source_kind in \('quest_engine','ai_background'\) then/,
  )
  assert.match(schemaSql, /'effective_game_day',v_run\.campaign_day/)
})

test("Stage 2 does not steal Stage 3 entity classification", () => {
  assert.doesNotMatch(schemaSql, /background_simulation_scope/)
})

test("game chat excludes future game-day evidence instead of clamping it to age zero", () => {
  assert.match(gameChatContext, /payload\.effective_game_day/)
  assert.match(gameChatContext, /function eventVisibleAtGameDay/)
  assert.match(gameChatContext, /time\.campaignDay <= currentDay/)
  assert.match(gameChatContext, /memorySourceSetVisibleAtGameDay/)
  assert.doesNotMatch(
    gameChatContext,
    /Math\.max\(0, currentDay - time\.campaignDay\)/,
  )
})

test("Stage 2 foreign-key paths have covering indexes", () => {
  assert.match(indexSql, /ai_background_daily_runs_world_roll_receipt_idx/)
  assert.match(indexSql, /ai_background_rolls_run_campaign_day_fk_idx/)
  assert.match(indexSql, /ai_background_events_run_campaign_day_fk_idx/)
  assert.match(indexSql, /ai_background_snapshots_run_campaign_day_fk_idx/)
  assert.match(indexSql, /ai_background_snapshots_source_event_idx/)
})
