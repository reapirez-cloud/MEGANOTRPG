import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260923120000_ai_gm_dialogue_stage7_v1.sql",
)
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const roadmap = read("docs/AI_GM_ROADMAP.md")
const readinessDebt = read("src/ai/aiGmReadinessDebt.ts")

test("Stage 7 publishes ordered GM outputs idempotently", () => {
  assert.match(migration, /chat_messages_ai_gm_output_sequence_unique/)
  assert.match(migration, /turn_component='ai_gm_output'/)
  assert.match(migration, /publish_ai_gm_turn_message_v1/)
  assert.match(migration, /publish_ai_gm_turn_messages_v1/)
  assert.match(migration, /ai_gm_output_sequence_conflict/)
  assert.match(migration, /p_sequence < 1 or p_sequence > 12/)
})

test("Stage 7 exposes explicit narration and NPC dialogue server tools", () => {
  assert.match(migration, /send_ai_gm_narration_v1/)
  assert.match(migration, /send_ai_gm_npc_dialogue_v1/)
  assert.match(migration, /ai_gm_npc_not_present_with_source_character/)
  assert.match(migration, /c\.character_type='npc'/)
  assert.match(migration, /c\.publication_state='campaign'/)
  assert.match(migration, /grant execute on function public\.send_ai_gm_narration_v1/)
  assert.match(migration, /grant execute on function public\.send_ai_gm_npc_dialogue_v1/)
  assert.match(migration, /to service_role/)
})

test("Stage 7 planner supports alternating Narrator and NPC outputs", () => {
  assert.match(runtime, /\| "dialogue_sequence"/)
  assert.match(runtime, /parsed\.messages\.slice\(0, 8\)/)
  assert.match(runtime, /kind: "narration"/)
  assert.match(runtime, /kind: "npc_dialogue"/)
  assert.match(runtime, /publishDialogueSequence/)
  assert.match(runtime, /publish_ai_gm_turn_messages_v1/)
  assert.match(runtime, /reply_message_ids: messageIds/)
  assert.match(runtime, /runtime_stage: (?:[7-9]|1[0-2])/)
})

test("NPC dialogue text is regenerated from a restricted NPC-only context", () => {
  assert.match(runtime, /NPC_DIALOGUE_SYSTEM/)
  assert.match(runtime, /generateNpcDialogue/)
  assert.match(runtime, /npcDialogueContextForPrompt/)
  assert.match(runtime, /Если факта там нет, NPC его не знает/)
  assert.match(runtime, /Не используй скрытые знания ведущего/)
  assert.match(runtime, /сервер отдельно сгенерирует её из ограниченного контекста/)
})

test("Restricted NPC context excludes omniscient GM and quest-secret inputs", () => {
  const start = context.indexOf("export function npcDialogueContextForPrompt")
  assert.ok(start >= 0)
  const npcContext = context.slice(start)

  assert.match(npcContext, /no_omniscient_quest_context: true/)
  assert.match(npcContext, /no_hidden_gm_notes: true/)
  assert.match(npcContext, /explicitly_visible_memory/)
  assert.match(npcContext, /world_state_updated_at/)
  assert.match(npcContext, /recent_messages_observed_since_current_presence/)
  assert.doesNotMatch(npcContext, /activeQuestContext/)
  const safeProfileStart = npcContext.indexOf("const safeProfile")
  const safeProfileEnd = npcContext.indexOf("const nameById", safeProfileStart)
  const safeProfile = npcContext.slice(safeProfileStart, safeProfileEnd)
  assert.doesNotMatch(safeProfile, /gm_notes/)
  assert.doesNotMatch(safeProfile, /gm_note/)
})

test("NPC plan cannot smuggle model-written dialogue body into chat", () => {
  const npcBranchStart = runtime.indexOf('if (item.type === "npc_dialogue")')
  assert.ok(npcBranchStart >= 0)
  const npcBranchEnd = runtime.indexOf("return []", npcBranchStart)
  const npcBranch = runtime.slice(npcBranchStart, npcBranchEnd)
  assert.match(npcBranch, /npcCharacterId/)
  assert.doesNotMatch(npcBranch, /body:/)
})


test("Stage 7 is certified READY and its readiness debt is removed", () => {
  assert.match(
    roadmap,
    /\| 7 \| READY \| Multi-message Narrator\/NPC dialogue tool flow \|/,
  )
  assert.match(
    roadmap,
    /Stage 7 is READY\. READY stages: 1–7\. Next stage to execute: 8\./,
  )
  assert.doesNotMatch(readinessDebt, /id: "narrator-and-npc-dialogue"/)
})
