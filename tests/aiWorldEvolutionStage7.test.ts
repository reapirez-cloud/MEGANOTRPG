import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { AI_WORLD_EVOLUTION_STAGES } from "../src/ai-world-evolution/contract.ts"

const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)
const context = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-context.ts", import.meta.url),
  "utf8",
)

test("AI world evolution Stage 7 is certified", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 7)
  assert.ok(stage)
  assert.equal(stage.status, "certified")
})

test("primary AI GM receives real scene-actor provider tools", () => {
  for (const name of [
    "spawn_scene_actor",
    "use_scene_actor_action",
    "roll_scene_actor",
    "flee_scene_actor",
    "remove_scene_actor",
  ]) {
    assert.match(runtime, new RegExp(`name: "${name}"`))
  }
  assert.match(runtime, /tools: PRIMARY_GM_SCENE_ACTOR_TOOLS/)
  assert.match(runtime, /toolChoice: "auto"/)
})

test("unnamed encounter extras route to scene actors rather than persistent cards", () => {
  assert.match(runtime, /'трое бандитов'/)
  assert.match(runtime, /spawn_scene_actor/)
  assert.match(runtime, /Никогда не создавай Бандит 1\/2\/3 через world_materialization/)
  assert.match(runtime, /Disposable encounter actors живут только в scene runtime/)
  assert.match(runtime, /world_materializer_unnamed_scene_actor_rejected/)
})

test("active scene actor context is compact and exposes legal mechanic keys", () => {
  assert.match(context, /sceneActors: JsonRecord\[\]/)
  assert.match(context, /\.from\("ai_scene_actors"\)/)
  assert.match(context, /\.eq\("runtime_state", "active"\)/)
  assert.match(context, /\.eq\("life_state", "alive"\)/)
  assert.match(context, /mechanic_key: mechanic\.stable_key/)
  assert.match(context, /active_scene_actors: context\.sceneActors/)
  const start = context.indexOf("const sceneActors = rawSceneActors.map")
  const end = context.indexOf("const roomMembers =", start)
  assert.ok(start >= 0 && end > start)
  assert.doesNotMatch(
    context.slice(start, end),
    /attackBonus|diceCount|diceSides|diceModifier|saveDc/,
  )
})

test("scene-actor tools delegate identity and legal intent to server RPCs", () => {
  assert.match(runtime, /execute_ai_gm_actor_action_turn_v1/)
  assert.match(runtime, /p_actor_ref: \{ kind: "scene_actor", actorId \}/)
  assert.match(runtime, /p_mechanic_key: mechanicKey/)
  assert.match(runtime, /execute_ai_gm_actor_roll_v1/)
  const start = runtime.indexOf('name === "use_scene_actor_action"')
  const end = runtime.indexOf('name === "roll_scene_actor"', start)
  assert.ok(start >= 0 && end > start)
  assert.doesNotMatch(
    runtime.slice(start, end),
    /attackBonus|damageDice|saveDc|resourceCost/,
  )
})

test("flee and remove use server context revision rather than model-supplied state", () => {
  assert.match(runtime, /const revision = Number\(actor\?\.revision\)/)
  assert.match(runtime, /transition_ai_scene_actor_v1/)
  assert.match(runtime, /p_expected_revision: revision/)
  assert.doesNotMatch(
    runtime.slice(
      runtime.indexOf('name === "flee_scene_actor"'),
      runtime.indexOf('primary_gm_scene_actor_tool_not_allowed'),
    ),
    /args\.revision|args\.current_hp|args\.life_state/,
  )
})

test("pure direct-PC dialogue cannot trigger scene-actor tools", () => {
  assert.match(runtime, /context\.sourceAudience\.scope === "direct_pc"/)
  assert.match(runtime, /scene_actor_tool_blocked_for_direct_pc/)
})

test("save-action resume cannot execute the same scene actor mechanic twice", () => {
  assert.match(runtime, /last_scene_actor_id === actorId/)
  assert.match(runtime, /last_scene_actor_mechanic_key === mechanicKey/)
  assert.match(runtime, /duplicate_scene_actor_action_after_roll_resume_blocked/)
})

test("world materializer still rejects numbered or generic permanent NPC extras", () => {
  assert.match(runtime, /looksLikeTemporarySceneActorLabel/)
  assert.match(runtime, /world_materializer_unnamed_scene_actor_rejected/)
  assert.match(runtime, /Бандит 1/)
  assert.match(runtime, /не вызывай create_world_npc/)
})
