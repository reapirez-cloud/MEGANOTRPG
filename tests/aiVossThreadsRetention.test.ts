import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Voss supports multiple owned threads and chat selection", () => {
  const migration = read(
    "supabase/migrations/20260915180000_voss_threads_media_retention.sql",
  )
  const provider = read("src/ai/AIProvider.tsx")
  const shell = read("src/ai/AgentShell.tsx")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(migration, /drop constraint if exists ai_threads_campaign_id_user_id_agent_key_key/)
  assert.match(migration, /grant insert, delete on table public\.ai_threads to authenticated/)
  assert.match(provider, /export type AIThread/)
  assert.match(provider, /activeThreadId/)
  assert.match(provider, /createThread/)
  assert.match(provider, /switchThread/)
  assert.match(provider, /deleteThread/)
  assert.match(provider, /\.eq\("thread_id", nextThreadId\)/)
  assert.match(shell, />Чаты</)
  assert.match(shell, /u1-agent-thread-list/)
  assert.match(edge, /typeof body\.threadId/)
})

test("generated media expires after three days unless saved or attached", () => {
  const migration = read(
    "supabase/migrations/20260915180000_voss_threads_media_retention.sql",
  )
  const tools = read("supabase/functions/voss-agent/image-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")
  const provider = read("src/ai/AIProvider.tsx")
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(migration, /expires_at/)
  assert.match(migration, /saved_at/)
  assert.match(migration, /interval '3 days'/)
  assert.match(migration, /save_my_generated_media_v1/)
  assert.match(tools, /name: "save_generated_image"/)
  assert.match(tools, /cleanupExpiredMedia/)
  assert.match(tools, /expires_at: new Date\(Date\.now\(\) \+ 3 \* 24 \* 60 \* 60 \* 1000\)/)
  assert.match(edge, /срок хранения три дня/)
  assert.match(provider, /saveGeneratedAsset/)
  assert.match(provider, /save_my_generated_media_v1/)
  assert.match(shell, /saveGeneratedAsset\(asset\.id\)/)
  assert.match(shell, /Сохранить/)
  assert.match(shell, /Удалится после/)
})

test("Voss class catalog and server errors use real sources instead of fake model failures", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")
  const reads = read("supabase/functions/voss-agent/read-tools.ts")
  const provider = read("src/ai/AIProvider.tsx")

  assert.doesNotMatch(edge, /mechanicsTool/)
  assert.match(reads, /list_classes_and_subclasses/)
  assert.match(edge, /list_classes_and_subclasses/)
  assert.doesNotMatch(
    provider,
    /Восс пока не получил доступ к модели/,
  )
  assert.match(provider, /context\.clone\(\)\.json\(\)/)
})


test("Voss minimises without cancelling work, uses app chat confirmation, and hides Developer Mode", () => {
  const shell = read("src/ai/AgentShell.tsx")
  const provider = read("src/ai/AIProvider.tsx")
  const css = read("src/ai/ai-voss.css")

  assert.match(shell, /data-busy=\{\(sending \|\| pendingReply\) \|\| undefined\}/)
  assert.match(shell, /Восс работает в фоне/)
  assert.match(shell, /u1-agent-confirm/)
  assert.doesNotMatch(shell, /window\.confirm\(/)
  assert.doesNotMatch(shell, /Developer Mode|DEVELOPER RUN/)
  assert.match(provider, /threadMutationRef/)
  assert.match(provider, /threadId = await createThread\(\)/)
  assert.match(provider, /agentKey: "voss",[\s\S]*?threadId,[\s\S]*?message/)
  assert.match(css, /u1-agent-background-work/)
})

test("Voss accepts a durable user turn before background completion", () => {
  const provider = read("src/ai/AIProvider.tsx")
  const shell = read("src/ai/AgentShell.tsx")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /persistedUserMessage/)
  assert.match(provider, /deliveryMode: "async-v1"/)
  assert.match(edge, /body\.deliveryMode === "async-v1"/)
  assert.match(edge, /if \(!asyncDeliveryRequested\) \{[\s\S]*?return await processTurn\(\)/)
  assert.match(edge, /runBackground\(backgroundTurn\)/)
  assert.match(edge, /accepted: true/)
  assert.match(edge, /\}, 202\)/)
  assert.match(edge, /role: "assistant"[\s\S]*?delivery_error/)
  assert.match(provider, /pendingReply/)
  assert.match(provider, /window\.setInterval/)
  assert.match(provider, /2200/)
  assert.match(shell, /setDraft\(""\)/)
  assert.match(shell, /setAttachments\(\[\]\)/)
  assert.match(shell, /sending \|\| pendingReply/)
})

test("Voss delete confirmation stays above its tools drawer and uses graphite styling", () => {
  const css = read("src/ai/ai-voss.css")

  assert.match(css, /\.u1-agent-tools-drawer[\s\S]*?z-index: 21/)
  assert.match(css, /\/\* Graphite AI law:/)
  assert.match(css, /\.u1-agent-confirm-shade[\s\S]*?z-index: 60/)
  assert.match(css, /linear-gradient\(180deg, #111315 0%, #090b0c 48%, #070809 100%\)/)
})

test("Voss image policy uses low only for inventory/icons and high for every other profile", () => {
  const profiles = read("supabase/functions/voss-agent/image-profiles.ts")
  const tools = read("supabase/functions/voss-agent/image-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(profiles, /tiny_icon[\s\S]*?quality: "low"/)
  assert.match(profiles, /ui_preview[\s\S]*?quality: "high"/)
  assert.match(profiles, /portrait[\s\S]*?quality: "high"/)
  assert.match(profiles, /panel[\s\S]*?quality: "high"/)
  assert.match(profiles, /hero_art[\s\S]*?quality: "high"/)
  assert.match(profiles, /master_art[\s\S]*?quality: "high"/)
  assert.match(tools, /inventory\/item visuals[\s\S]*?50K/)
  assert.match(edge, /purpose=icon[\s\S]*?low \/ 50K/)
  assert.match(edge, /Medium не используй/)
})
