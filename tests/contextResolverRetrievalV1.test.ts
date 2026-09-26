import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const retrievalMigration = readFileSync(
  "supabase/migrations/20260926054041_context_resolver_retrieval_index_v1.sql",
  "utf8",
)
const searchMigration = readFileSync(
  "supabase/migrations/20260926054211_context_resolver_or_token_search_v2.sql",
  "utf8",
)
const historyMigration = readFileSync(
  "supabase/migrations/20260926054552_context_resolver_recent_chat_location_history_v3.sql",
  "utf8",
)
const permissionMigration = readFileSync(
  "supabase/migrations/20260926055522_context_resolver_service_role_permission_v4.sql",
  "utf8",
)
const morphologyMigration = readFileSync(
  "supabase/migrations/20260926055527_context_resolver_russian_morphology_v4.sql",
  "utf8",
)
const context = readFileSync(
  "supabase/functions/voss-agent/game-chat-context.ts",
  "utf8",
)
const runtime = readFileSync(
  "supabase/functions/voss-agent/game-chat-runtime.ts",
  "utf8",
)
const memory = readFileSync(
  "supabase/functions/voss-agent/memory-tools.ts",
  "utf8",
)
const maintenance = readFileSync(
  "supabase/functions/voss-agent/world-maintenance.ts",
  "utf8",
)

test("Context Resolver searches the full campaign before limiting output", () => {
  assert.match(retrievalMigration, /resolve_ai_gm_context_v1/)
  assert.match(
    retrievalMigration,
    /search_scope','entire_campaign_before_output_limit'/,
  )
  assert.match(retrievalMigration, /pre_limit_recent_memory',false/)
  assert.match(searchMigration, /resolve_ai_gm_context_v2/)
  assert.match(searchMigration, / OR /)
  assert.match(context, /resolve_ai_gm_context_v2/)
  assert.doesNotMatch(context, /memoryFactsResult/)
  assert.doesNotMatch(context, /memorySummariesResult/)
})

test("Junior memory writes hidden retrieval tags and canonical entity links", () => {
  assert.match(memory, /search_tags/)
  assert.match(memory, /search_aliases/)
  assert.match(memory, /relation_keys/)
  assert.match(memory, /entity_refs/)
  assert.match(runtime, /КАЖДЫЙ memory fact обязан одновременно получить скрытый retrieval-index/)
  assert.match(runtime, /retrieval_tag_dictionary/)
  assert.match(runtime, /UUID entity_refs важнее тегов/)
  assert.match(maintenance, /скрытый retrieval-index/)
})

test("Resolver links survive prompt compaction and get one bounded graph hop", () => {
  assert.match(context, /entity_refs: rows\(fact\.entity_refs\)/)
  assert.match(context, /retrieval\.linked_entities/)
  assert.match(context, /retrieved_campaign_context/)
  assert.match(context, /lore_entries: rows\(context\.retrieval\.lore_entries\)/)
  assert.match(context, /linked_entities: record\(context\.retrieval\.linked_entities\)/)
})

test("Recent room chat survives location changes while retaining per-message snapshots", () => {
  assert.match(historyMigration, /cross_location_room_history',true/)
  assert.match(historyMigration, /source_location_id/)
  assert.doesNotMatch(
    historyMigration,
    /e\.location_id=p_source_location_id/,
  )
})


test("Context Resolver RPC is callable by the service role and supports Russian morphology", () => {
  assert.match(permissionMigration, /grant usage on schema private to service_role/i)
  assert.match(
    permissionMigration,
    /grant execute on function private\.build_context_websearch_query_v1\(text\) to service_role/i,
  )
  assert.match(morphologyMigration, /context_search_vector_v2/)
  assert.match(morphologyMigration, /pg_catalog\.russian/)
  assert.match(morphologyMigration, /build_context_websearch_query_v2/)
  assert.match(morphologyMigration, /resolver_version',3/)
  assert.match(morphologyMigration, /morphology','russian\+simple'/)
})
