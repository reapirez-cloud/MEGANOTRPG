import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)
const ui = readFileSync(
  new URL("../src/ui-v1-isolated/AiGmControl.tsx", import.meta.url),
  "utf8",
)

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, `missing block: ${start}`)
  return source.slice(from, to)
}

test("player-facing roll request never publishes resolver plumbing", () => {
  assert.match(runtime, /PLAYER_FACING_META_LANGUAGE/)
  assert.match(runtime, /playerFacingRollReason/)
  assert.match(runtime, /p_reason: playerFacingRollReason\(request\)/)
  assert.match(runtime, /roll_request\.reason и roll_request\.label являются ВИДИМЫМИ игроку/)
  assert.match(runtime, /Никогда не пиши игроку слова и понятия Resolver\/резолвер/)
})

test("resolver outcomes stay visible through roleplay rather than meta explanation", () => {
  const gmPrompt = block(
    runtime,
    "const STAGE12_GAME_MASTER_SYSTEM",
    "const NPC_DIALOGUE_SYSTEM",
  )
  assert.match(gmPrompt, /Механику при этом НЕ прячь/)
  assert.match(gmPrompt, /проговори результат через наблюдаемую реальность/)
  assert.match(gmPrompt, /Ты не знаешь, есть ли здесь такая хижина/)
  assert.match(gmPrompt, /Никогда не объясняй это словами «не канон»/)
})

test("hardcore means economic causality, not forced poverty", () => {
  const gmPrompt = block(
    runtime,
    "const STAGE12_GAME_MASTER_SYSTEM",
    "const NPC_DIALOGUE_SYSTEM",
  )
  assert.match(gmPrompt, /экономика обязана сохранять масштаб мира/)
  assert.match(gmPrompt, /Зарплаты, цены, аренда, взятки, награды, добыча/)
  assert.match(gmPrompt, /Hardcore НЕ означает искусственно делать PC нищим/)
  assert.match(ui, /реальный масштаб экономики/)
})

test("adult mode is framed as positive thematic permission", () => {
  const gmPrompt = block(
    runtime,
    "const STAGE12_GAME_MASTER_SYSTEM",
    "const NPC_DIALOGUE_SYSTEM",
  )
  const npcPrompt = block(
    runtime,
    "const NPC_DIALOGUE_SYSTEM",
    "function jsonRecord",
  )

  assert.match(gmPrompt, /content_profile\.mode=allowed/)
  assert.match(gmPrompt, /content_profile\.mode=adult_focused/)
  assert.match(npcPrompt, /content_profile\.mode=allowed/)
  assert.doesNotMatch(gmPrompt, /provider|policy|jailbreak|цензур/i)
  assert.doesNotMatch(npcPrompt, /provider|policy|jailbreak|цензур/i)
})
