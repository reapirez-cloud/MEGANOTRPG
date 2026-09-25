import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const status = read("src/ui-v1-isolated/chat-room/AiGmTurnStatus.tsx")
const css = read("src/ui-v1-isolated/chat-room/chat-room.css")

test("primary GM provider rounds are marked thinking while waiting on the model", () => {
  assert.match(
    runtime,
    /for \(let round = 0; round < 6; round \+= 1\) \{[\s\S]{0,220}setRuntimePhase\(admin, claimed, "thinking"\)[\s\S]{0,220}requestChatCompletion/,
  )
})

test("world materializer exposes thinking only during model waits and applying for tools", () => {
  assert.match(runtime, /setPhase\?\: \(phase: "thinking" \| "applying"\)/)
  assert.match(runtime, /if \(setPhase\) await setPhase\("thinking"\)[\s\S]{0,180}requestJuniorCompletionWithFallback/)
  assert.match(runtime, /if \(calls\.length && setPhase\) await setPhase\("applying"\)/)
})

test("NPC final text generation stays interruptible until publish", () => {
  assert.match(
    runtime,
    /reaction\.mode === "npc_interjection"[\s\S]{0,260}setRuntimePhase\(admin, claimed, "thinking"\)[\s\S]{0,260}generateNpcDialogue/,
  )
  assert.match(
    runtime,
    /generateNpcDialogue[\s\S]{0,420}setRuntimePhase\(admin, claimed, "applying"\)[\s\S]{0,180}finalizeStage18VisibleAnswer/,
  )
})

test("roll mechanic worker is thinking before the atomic roll reservation", () => {
  assert.match(
    runtime,
    /reaction\.mode === "request_player_roll"[\s\S]{0,180}setRuntimePhase\(admin, claimed, "thinking"\)[\s\S]{0,520}normalizePlayerRollWithWorker[\s\S]{0,220}setRuntimePhase\(admin, claimed, "applying"\)/,
  )
})

test("stop and edit controls stay visible for the whole pre-answer job", () => {
  assert.match(status, /const preAnswerControlsVisible = Boolean/)
  assert.match(status, /\{preAnswerControlsVisible \? \(/)
  assert.match(status, /Остановить шуршание/)
  assert.match(status, /Редактировать/)
  assert.match(status, /atomicMutationInFlight/)
  assert.match(css, /\.u1-ai-gm-status__hint/)
})
