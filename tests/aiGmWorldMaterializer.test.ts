import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)

test("AI GM can request canonical world materialization before narrating", () => {
  assert.match(runtime, /world_materialization=true/)
  assert.match(runtime, /worldMaterializationRequested/)
  assert.match(runtime, /reaction\.worldMaterializationRequested === true/)
  assert.match(runtime, /!context\.sourceLocation/)
})

test("world materializer is fixed to the cheap Flash worker", () => {
  assert.match(runtime, /WORLD_MATERIALIZER_MODEL_KEY = "deepseek-v4\.1-flash"/)
  assert.match(runtime, /resolveWorldMaterializerModel/)
  assert.match(runtime, /supports_tools/)
})

test("world materializer exposes creation tools but no destructive world tools", () => {
  for (const tool of [
    "create_location",
    "create_world_npc",
    "upsert_location_transition",
    "upsert_faction",
    "move_character_world",
  ]) {
    assert.match(runtime, new RegExp('"' + tool + '"'))
  }
  assert.doesNotMatch(
    runtime.slice(
      runtime.indexOf("const WORLD_MATERIALIZER_TOOL_NAMES"),
      runtime.indexOf("const WORLD_MATERIALIZER_TOOLS"),
    ),
    /delete_location|set_character_life_state/,
  )
})

test("empty AI world gets a canonical location and server movement fallback", () => {
  assert.match(
    runtime,
    /round === 0 && !context\.sourceLocation[\s\S]*name: "create_location"/,
  )
  assert.match(runtime, /firstCreatedLocationId/)
  assert.match(runtime, /server_fallback: true/)
  assert.match(runtime, /"move_character_world"/)
})

test("AI GM rereads canonical context after world changes", () => {
  assert.match(runtime, /if \(materialization\.changed\)[\s\S]*buildGameChatContextV2/)
  assert.match(runtime, /КАНОНИЧЕСКИЙ СНИМОК ПОСЛЕ WORLD MATERIALIZATION/)
  assert.match(runtime, /Не запрашивай world_materialization второй раз/)
})


test("primary GM hands intent and constraints while Flash enriches implementation details", () => {
  assert.match(runtime, /world_materialization_task/)
  assert.match(runtime, /worldMaterializationTask/)
  assert.match(runtime, /slice\(0, 2000\)/)
  assert.match(runtime, /ТЕХНИЧЕСКОЕ ЗАДАНИЕ ОСНОВНОГО ИИ-ГМ/)
  assert.match(runtime, /МОЖЕШЬ и ДОЛЖЕН дополнять недостающие безопасные детали/)
  assert.match(runtime, /Дополняй качество существующей задачи, а не её масштаб/)
  assert.match(runtime, /materializationTask: reaction\.worldMaterializationTask/)
})

test("Flash creation worker can materialize quests and hidden location state", () => {
  for (const tool of [
    "upsert_location_secret",
    "create_quest_plan",
    "activate_quest",
    "bind_quest_target",
    "materialize_quest_target",
  ]) {
    assert.match(runtime, new RegExp('"' + tool + '"'))
  }
  assert.match(runtime, /executeVossQuestTool/)
  assert.match(runtime, /WORLD_MATERIALIZER_QUEST_TOOL_NAMES/)
})


test("world materializer does not persist unnamed scene extras as NPC cards", () => {
  assert.match(runtime, /Не материализуй безымянную массовку/)
  assert.match(runtime, /Бандит 1/)
  assert.match(runtime, /имя не раскрывается игроку/)
  assert.match(runtime, /не вызывай create_world_npc/)
  assert.match(runtime, /одну карточку с настоящим именем/)
})
