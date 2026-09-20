import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("DeepSeek and Grok use their highest advertised reasoning effort", () => {
  const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")

  assert.match(gateway, /deepseek-v4\.1-flash"[\s\S]*return "max"/)
  assert.match(gateway, /grok-4\.6"[\s\S]*return "xhigh"/)
  assert.match(gateway, /reasoning_effort/)
  assert.match(gateway, /disableReasoningEffort/)
  assert.match(gateway, /timeoutMs/)
})

test("Voss stays in human character instead of narrating AI internals", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")

  assert.match(voice, /всегда остаёшься Рейнаром Воссом/)
  assert.match(voice, /живым человеком внутри мира MEGANOT/)
  assert.match(voice, /Никогда сам не упоминай модель, провайдера, tool call/)
  assert.match(voice, /не выдавай служебные статусы/)
  assert.match(voice, /если.*настоящим человеком или программой[\s\S]*не ври/i)
})

test("Voss runtime has no mechanics authoring tools or mechanics route", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")
  const router = read("supabase/functions/voss-agent/model-router.ts")
  const shell = read("src/ai/AgentShell.tsx")

  assert.doesNotMatch(edge, /VOSS_MECHANICS_TOOLS/)
  assert.doesNotMatch(edge, /executeVossMechanicsTool/)
  assert.doesNotMatch(edge, /isVossMechanicsTool/)
  assert.match(edge, /isMechanicsAuthoringRequest/)
  assert.match(edge, /grantedCapabilities\.has\("content\.write"\) && !mechanicsAuthoringRequested/)
  assert.doesNotMatch(router, /\| "mechanics_compile"/)
  assert.doesNotMatch(router, /return "mechanics_compile"/)
  assert.doesNotMatch(shell, /MECHANICS COMPILER/)
})

test("Voss content drafts cannot smuggle executable mechanics", () => {
  const drafts = read("supabase/functions/voss-agent/draft-tools.ts")

  assert.match(drafts, /containsMechanicsPayload/)
  assert.match(drafts, /normalized === "mechanics"/)
  assert.match(drafts, /normalized === "mechanics_compilation_id"/)
  assert.match(drafts, /Voss does not author mechanics in content drafts/)
})

test("Voss can inspect the visible MEGANOT campaign surface and chats", () => {
  const reads = read("supabase/functions/voss-agent/read-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(reads, /name: "read_campaign_overview"/)
  assert.match(reads, /name: "read_chat_room"/)
  assert.match(reads, /name: "search_chat_messages"/)
  assert.match(reads, /\.from\("characters"\)/)
  assert.match(reads, /\.from\("locations"\)/)
  assert.match(reads, /\.from\("chat_rooms"\)/)
  assert.match(reads, /\.from\("chat_messages"\)/)
  assert.match(reads, /\.from\("world_articles"\)/)
  assert.match(reads, /\.from\("achievements"\)/)
  assert.match(reads, /\.from\("feed_items"\)/)
  assert.match(reads, /\.from\("campaign_art_items"\)/)
  assert.match(edge, /readWorkflowInstructions/)
  assert.match(edge, /read_campaign_overview/)
})

test("Voss purpose is guidance, ordinary content creation and art rather than rules engineering", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")
  const drafts = read("supabase/functions/voss-agent/draft-tools.ts")

  assert.match(voice, /помогать не потеряться/)
  assert.match(voice, /предметы, локации, переписки/)
  assert.match(voice, /изображения\/сцены/)
  assert.match(edge, /локации, НПС\/ПС, предметы/)
  assert.match(drafts, /locations, characters, items, classes\/reference definitions/)
})
