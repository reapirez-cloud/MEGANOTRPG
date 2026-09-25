import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const migration = read(
  "supabase/migrations/20260925055000_ai_gm_regenerate_preserve_resolved_roll_v1.sql",
)

test("resolver validation errors are returned to the model instead of killing the GM turn", () => {
  assert.match(runtime, /if \(message\.startsWith\("random_decision_"\)\)/)
  assert.match(runtime, /random_decision_rejected: true/)
  assert.match(runtime, /forceFinalWithoutTools = true/)
  assert.match(runtime, /Do not retry or remap this resolver call/)
})

test("regeneration can inherit a resolved player roll without rerolling mechanics", () => {
  assert.match(runtime, /replay_mechanics_locked/)
  assert.match(runtime, /REGENERATION WITH LOCKED MECHANICS/)
  assert.match(runtime, /inherited_scene_actor_tool_runs/)
  assert.match(runtime, /replayMechanicsLocked \|\| resolvedRollContinuationLocked/)
  assert.match(runtime, /REGENERATION MECHANICS LOCK/)
  assert.match(runtime, /forbiddenReplayMode/)
  assert.match(runtime, /replayPostTurnIntents\.length > 0/)

  assert.match(migration, /reserve_ai_gm_replay_preserving_roll_v1/)
  assert.match(migration, /v_mode <> 'regenerate'/)
  assert.match(migration, /pr\.status='resolved'/)
  assert.match(migration, /'replay_mechanics_locked',true/)
  assert.match(migration, /'resume_chat_message_id',v_roll\.roll_message_id::text/)
  assert.match(migration, /'last_roll_result',coalesce\(/)
  assert.match(migration, /v_other_irreversible>0/)
  assert.match(migration, /ai_gm_regenerate_has_committed_post_turn_world_changes/)
})

test("replay helper remains backend-only", () => {
  assert.match(
    migration,
    /revoke all on function private\.reserve_ai_gm_replay_preserving_roll_v1[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function private\.reserve_ai_gm_replay_preserving_roll_v1[\s\S]*to service_role/,
  )
  assert.match(
    migration,
    /revoke all on function public\.reserve_ai_gm_replay_v1[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function public\.reserve_ai_gm_replay_v1[\s\S]*to service_role/,
  )
})
