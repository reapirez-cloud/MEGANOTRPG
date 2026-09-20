import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 7 persists durable campaign history from server-confirmed sources", () => {
  const migration = read(
    "supabase/migrations/20260914172205_campaign_memory_stage7.sql",
  )

  assert.match(migration, /create table public\.campaign_events/)
  assert.match(migration, /sync_campaign_memory_chat_event/)
  assert.match(migration, /sync_campaign_memory_update_event/)
  assert.match(migration, /sync_campaign_memory_ai_apply_event/)
  assert.match(migration, /where r\.category = 'game'/)
  assert.doesNotMatch(migration, /engineEventBus/)
})

test("campaign memory visibility is RLS-enforced and room-aware", () => {
  const migration = read(
    "supabase/migrations/20260914172205_campaign_memory_stage7.sql",
  )

  assert.match(migration, /can_read_campaign_memory_scope/)
  assert.match(migration, /private\.can_read_chat_room/)
  assert.match(migration, /private\.is_campaign_manager/)
  assert.match(migration, /campaign_events_read_visible/)
  assert.match(migration, /campaign_memory_facts_read_visible/)
  assert.match(migration, /campaign_memory_summaries_read_visible/)
  assert.match(migration, /grant select on public\.campaign_events to authenticated/)
  assert.doesNotMatch(migration, /grant insert on public\.campaign_events to authenticated/i)
})

test("Only-me style user-scoped memory does not grant a manager override", () => {
  const migration = read(
    "supabase/migrations/20260914172205_campaign_memory_stage7.sql",
  )

  assert.match(
    migration,
    /when 'users' then\s+p_user_id = any\(coalesce\(p_visible_user_ids/,
  )
})

test("Voss Stage 7 exposes durable search and timeline reads", () => {
  const tools = read("supabase/functions/voss-agent/memory-tools.ts")

  assert.match(tools, /name: "search_campaign_memory"/)
  assert.match(tools, /name: "read_campaign_timeline"/)
  assert.match(tools, /from\("campaign_events"\)/)
  assert.match(tools, /from\("campaign_memory_facts"\)/)
  assert.match(tools, /from\("campaign_memory_summaries"\)/)
})

test("memory reads use the signed-in client while writes are GM-only", () => {
  const tools = read("supabase/functions/voss-agent/memory-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(tools, /context\.client[\s\S]*from\("campaign_events"\)/)
  assert.match(tools, /if \(!context\.canManage\) return \{ error: "GM authority required" \}/)
  assert.match(edge, /const scopedMemoryReadTools[\s\S]*VOSS_MEMORY_READ_TOOLS/)
  assert.match(edge, /grantedCapabilities\.has\("memory\.write"\)[\s\S]*VOSS_MEMORY_WRITE_TOOLS/)
  assert.match(edge, /canChooseModel/)
})

test("derived memory cannot broaden source visibility", () => {
  const tools = read("supabase/functions/voss-agent/memory-tools.ts")

  assert.match(tools, /sourceScopeAllows/)
  assert.match(tools, /Memory visibility would be broader/)
  assert.match(tools, /Summary visibility would be broader/)
})

test("facts support explicit supersession instead of silent overwrite", () => {
  const tools = read("supabase/functions/voss-agent/memory-tools.ts")
  const migration = read(
    "supabase/migrations/20260914172205_campaign_memory_stage7.sql",
  )

  assert.match(tools, /supersedes_fact_id/)
  assert.match(tools, /status: "superseded"/)
  assert.match(migration, /superseded_by/)
  assert.match(migration, /retracted/)
})

test("Voss treats summaries and remembered facts as derived memory, not canon", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /производные слои памяти/)
  assert.match(edge, /не заменяют каноническое текущее состояние/)
  assert.match(edge, /Обычный вопрос или просьба пересказать историю не является разрешением/)
})

test("derived memory is invalidated when a source event changes or disappears", () => {
  const migration = read(
    "supabase/migrations/20260914172710_campaign_memory_source_invalidation_stage7.sql",
  )
  const tools = read("supabase/functions/voss-agent/memory-tools.ts")

  assert.match(migration, /invalidate_campaign_memory_from_event/)
  assert.match(migration, /source_event_deleted/)
  assert.match(migration, /source_event_changed/)
  assert.match(migration, /status = 'retracted'/)
  assert.match(migration, /status = 'invalidated'/)
  assert.match(tools, /\.eq\("status", "active"\)/)
})
