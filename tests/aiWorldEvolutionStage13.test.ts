import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  applyLocationTemporalOverlay,
  effectiveNpcTemporalState,
  eventVisibleAtGameDay,
  withGameAge,
} from "../supabase/functions/voss-agent/temporal-overlay.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260924052701_ai_world_evolution_stage13_temporal_overlay_v1.sql", import.meta.url),
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
const worker = readFileSync(
  new URL("../supabase/functions/voss-agent/background-world.ts", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

test("stage 13 contract is certified", () => {
  const stage13 = contract.slice(
    contract.indexOf('id: 13,'),
    contract.indexOf('id: 14,'),
  )
  assert.match(stage13, /status: "certified"/)
})

test("future memory is excluded instead of being age zero", () => {
  const futureEvent = {
    payload: { effective_game_day: 5, day_period: "day" },
  }
  assert.equal(eventVisibleAtGameDay(futureEvent, 3), false)

  const aged = withGameAge(
    { statement: "future fact" },
    futureEvent,
    3,
  )
  assert.equal(aged.game_age_days, null)

  const pastEvent = {
    payload: { effective_game_day: 2, day_period: "night" },
  }
  assert.equal(eventVisibleAtGameDay(pastEvent, 3), true)
  assert.equal(withGameAge({}, pastEvent, 3).game_age_days, 1)
})

test("NPC temporal overlay overrides canonical life/location without mutation", () => {
  const effective = effectiveNpcTemporalState(
    { life_state: "alive" },
    "11111111-1111-4111-8111-111111111111",
    {
      id: "snapshot-5",
      state: {
        temporal_overlay: {
          life_state: "dead",
          location_id: "22222222-2222-4222-8222-222222222222",
          status: "slain",
        },
      },
    },
  )

  assert.equal(effective.lifeState, "dead")
  assert.equal(
    effective.locationId,
    "22222222-2222-4222-8222-222222222222",
  )
  assert.equal(effective.status, "slain")
})

test("location temporal overlay supplies effective lifecycle", () => {
  const location = applyLocationTemporalOverlay(
    { id: "loc", lifecycle_state: "active", name: "Harbor" },
    {
      id: "snapshot-5",
      state: {
        temporal_overlay: {
          lifecycle_state: "archived",
          status: "destroyed",
        },
      },
    },
  )

  assert.equal(location?.base_lifecycle_state, "active")
  assert.equal(location?.lifecycle_state, "archived")
  assert.equal(location?.temporal_status, "destroyed")
})

test("database temporal loader is strictly scene-day bounded", () => {
  assert.match(migration, /s\.through_game_day<=p_scene_day/)
  assert.match(migration, /b\.effective_game_day<=p_scene_day/)
  assert.match(migration, /order by s\.entity_id,s\.through_game_day desc,s\.version desc/)
  assert.match(migration, /limit 8/)
})

test("primary GM context consumes temporal background state", () => {
  assert.match(context, /read_ai_background_temporal_context_v1/)
  assert.match(context, /applyLocationTemporalOverlay/)
  assert.match(context, /effectiveNpcTemporalState/)
  assert.match(context, /background_temporal_context: context\.background/)
  assert.match(runtime, /background_temporal_context — серверный временной слой/)
  assert.match(runtime, /не пытайся самостоятельно синхронизировать базу/)
})

test("Flash can emit only validated temporal overlay fields", () => {
  assert.match(worker, /proposed_state\.temporal_overlay/)
  assert.match(migration, /ai_background_npc_temporal_overlay_key_invalid/)
  assert.match(migration, /ai_background_location_temporal_overlay_key_invalid/)
  assert.match(migration, /ai_background_npc_temporal_location_not_found/)
})
