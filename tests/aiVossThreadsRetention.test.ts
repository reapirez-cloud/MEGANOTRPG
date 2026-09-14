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
  assert.match(shell, />Сохранить</)
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
