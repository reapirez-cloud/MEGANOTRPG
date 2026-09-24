import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)
const roadmap = readFileSync(
  new URL("../docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md", import.meta.url),
  "utf8",
)
const rollSpec = readFileSync(
  new URL("../docs/AI_WORLD_EVOLUTION_STAGE17_LOGIC_ROLLS.md", import.meta.url),
  "utf8",
)
const context = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-context.ts", import.meta.url),
  "utf8",
)

function stage(id: number, next: number | null) {
  const start = contract.indexOf(`id: ${id},`)
  const end = next === null
    ? contract.indexOf("] as const satisfies readonly AiWorldEvolutionStage[]")
    : contract.indexOf(`id: ${next},`)
  assert.ok(start >= 0 && end > start, `stage ${id} must exist`)
  return contract.slice(start, end)
}

test("post-16 roadmap has 24 executable stages", () => {
  assert.match(contract, /AI_WORLD_EVOLUTION_STAGE_COUNT = 24 as const/)
  for (let id = 17; id <= 24; id += 1) {
    assert.match(stage(id, id < 24 ? id + 1 : null), /status: "planned"/)
  }
})

test("stage 17 delegates semantic checks to a smaller mechanic worker", () => {
  const s = stage(17, 18)
  assert.match(s, /mechanic\/roll worker/i)
  assert.match(s, /Constitution check\/save for strong alcohol/)
  assert.match(s, /primary GM knowing the app API/)
  assert.match(s, /impossible_exact/)
  assert.match(rollSpec, /Primary GM does not need the application API/)
  assert.match(rollSpec, /strong alcohol -> Constitution check\/save/)
})

test("stage 18 publishes answer before junior world bookkeeping and gates input", () => {
  const s = stage(18, 19)
  assert.match(s, /Publish the GM answer first/)
  assert.match(s, /post_turn_intents/)
  assert.match(s, /Младший шуршит/)
  assert.match(s, /Server-owned turn gate blocks new player chat messages/)
  assert.match(roadmap, /GM final visible answer is published[\s\S]*Младший шуршит/)
})

test("stage 19 keeps primary GM context bounded and excludes worker chatter", () => {
  const s = stage(19, 20)
  assert.match(context, /const CHAT_CONTEXT_LIMIT = 50/)
  assert.match(s, /latest up-to-50 visible scene messages/)
  assert.match(s, /agent_jobs history/)
  assert.match(s, /junior tool calls/)
  assert.match(s, /commands never become narrative chat history/)
  assert.match(roadmap, /latest \*\*up to 50\*\* messages/)
})

test("stage 20 requires durable NPC identity rather than demeanor only", () => {
  const s = stage(20, 21)
  assert.match(s, /weighted values/)
  assert.match(s, /red lines\/non-negotiables/)
  assert.match(s, /behavior under pressure/)
  assert.match(s, /Primary GM, NPC dialogue model and background simulation/)
  assert.match(s, /social adjudication/)
})

test("stages 21-23 preserve world and NPC autonomy", () => {
  assert.match(stage(21, 22), /Жестокий/)
  assert.match(stage(21, 22), /Приключение/)
  assert.match(stage(21, 22), /Симс/)
  assert.match(stage(21, 22), /player intent is input, not canon/i)

  assert.match(stage(22, 23), /opportunity-selection guidance only/)
  assert.match(stage(22, 23), /cannot silently dominate another/)

  assert.match(stage(23, 24), /MEGANOT does not attempt to bypass provider restrictions/)
  assert.match(stage(23, 24), /not automatic NPC compliance/)
})

test("stage 24 certifies complete turn pipeline", () => {
  const s = stage(24, null)
  assert.match(s, /player message through GM reply/)
  assert.match(s, /junior post-turn commit/)
  assert.match(s, /500-turn bounded clean-context test/)
  assert.match(s, /Human-GM isolation regression suite/)
})
