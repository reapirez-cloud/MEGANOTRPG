import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const baseMigration = () =>
  read("supabase/migrations/20260924071000_ai_world_evolution_stage17_logic_rolls_v1.sql")
const proofMigration = () =>
  read("supabase/migrations/20260924092500_ai_world_evolution_stage17_world_proof_v2.sql")
const runtime = () =>
  read("supabase/functions/voss-agent/game-chat-runtime.ts")

test("Stage 17 persists immutable pre-roll adjudication before the real d20", () => {
  const sql = baseMigration()
  assert.match(sql, /create table if not exists public\.ai_player_intent_adjudications/)
  assert.match(sql, /source_intent_fingerprint/)
  assert.match(sql, /evidence_fingerprint/)
  assert.match(sql, /receipt_fingerprint/)
  assert.match(sql, /ai_player_intent_adjudications_immutable_update/)
  assert.match(sql, /stage17_player_roll_contract_is_frozen/)
  assert.match(sql, /public\.create_ai_gm_player_roll_request_v1\(/)
  assert.match(sql, /set adjudication_id = v_receipt\.id/)
})

test("Stage 17 hardened path is the only service-role semantic roll entrypoint", () => {
  const sql = proofMigration()
  assert.match(sql, /create or replace function public\.create_ai_gm_player_roll_request_v3/)
  assert.match(
    sql,
    /revoke all on function public\.create_ai_gm_player_roll_request_v2[\s\S]*from public, anon, authenticated, service_role/,
  )
  assert.match(
    sql,
    /grant execute on function public\.create_ai_gm_player_roll_request_v3[\s\S]*to service_role/,
  )
  assert.match(runtime(), /create_ai_gm_player_roll_request_v3/)
})

test("Stage 17 distinguishes character performance from world discovery", () => {
  const code = runtime()
  const sql = proofMigration()

  assert.match(code, /uncertaintyScope: "character_performance" \| "world_discovery"/)
  assert.match(code, /uncertainty_scope=character_performance/)
  assert.match(code, /uncertainty_scope=world_discovery/)
  assert.match(sql, /uncertainty_scope in \('character_performance','world_discovery'\)/)
  assert.match(sql, /stage17_world_discovery_requires_canonical_or_resolver_exists_proof/)
})

test("Stage 17 canonical world proof is validated against real campaign rows", () => {
  const sql = proofMigration()
  assert.match(sql, /private\.stage17_validate_canonical_evidence_v1/)
  assert.match(sql, /public\.locations/)
  assert.match(sql, /public\.characters/)
  assert.match(sql, /public\.ai_scene_actors/)
  assert.match(sql, /public\.quest_targets/)
  assert.match(sql, /public\.campaign_memory_facts/)
  assert.match(sql, /public\.reference_definitions/)
  assert.match(sql, /qt\.binding_state='bound'/)
  assert.match(sql, /l\.lifecycle_state='active'/)
  assert.match(sql, /c\.publication_state='campaign'/)
})

test("Stage 17 Resolver proof must belong to this exact GM job and explicitly establish existence", () => {
  const sql = proofMigration()
  assert.match(sql, /r\.run_key=p_job_id::text/)
  assert.match(sql, /r\.decision_kind='narrative\.branch'/)
  assert.match(sql, /r\.audit->>'caller_surface'.*'primary_gm'/)
  assert.match(sql, /stage17_world_existence/)
  assert.match(sql, /='exists'/)
  assert.match(sql, /='absent'/)
  assert.match(sql, /stage17_resolver_says_world_target_absent/)
})

test("Stage 17 impossible_exact can never become exact success", () => {
  const sql = baseMigration()
  const start = sql.indexOf(
    "elsif v_adjudication.adjudication_mode = 'impossible_exact'",
  )
  const end = sql.indexOf(
    "else\n      raise exception 'stage17_roll_has_non_roll_adjudication'",
    start,
  )
  assert.ok(start >= 0)
  assert.ok(end > start)
  const block = sql.slice(start, end)
  assert.match(block, /v_outcome_class := 'partial_success'/)
  assert.match(block, /v_outcome_class := 'failure'/)
  assert.doesNotMatch(block, /v_outcome_class := 'success'/)
})

test("Stage 17 freezes logical difficulty before delegating modifier and d20 to server", () => {
  const sql = baseMigration()
  assert.match(sql, /when 'very_easy' then 5/)
  assert.match(sql, /when 'easy' then 10/)
  assert.match(sql, /when 'moderate' then 15/)
  assert.match(sql, /when 'hard' then 20/)
  assert.match(sql, /when 'very_hard' then 25/)
  assert.match(sql, /when 'nearly_impossible' then 30/)
  assert.match(sql, /private\.resolve_player_roll_modifier_v1/)
  assert.match(sql, /public\.send_chat_roll_v4/)
})

test("Stage 17 primary GM emits semantics while Flash normalizes only mechanics", () => {
  const code = runtime()
  assert.match(code, /MECHANIC_WORKER_MODEL_KEY = "deepseek-v4\.1-flash"/)
  assert.match(code, /normalizePlayerRollWithWorker/)
  assert.match(code, /semantic_check/)
  assert.match(code, /logical_difficulty/)
  assert.match(code, /canonical_evidence/)
  assert.match(code, /resolver_decision_key/)
  assert.match(code, /НЕ указывай request_type\/ability_key\/skill_key\/attack_kind\/modifier/)
  assert.match(code, /крепкий алкоголь может требовать Constitution check\/save/)
})

test("Stage 17 requested roll can pass a later free-form chat gate without opening normal chat", () => {
  const sql = proofMigration()
  const resolverStart = sql.indexOf(
    "create or replace function public.resolve_player_roll_request_v1",
  )
  assert.ok(resolverStart >= 0)
  const resolver = sql.slice(resolverStart)
  assert.match(resolver, /set_config\('meganot\.ai_gm_runtime','on',true\)/)
  assert.match(resolver, /send_chat_roll_v4/)
  assert.ok(
    resolver.indexOf("set_config('meganot.ai_gm_runtime','on',true)") <
      resolver.indexOf("send_chat_roll_v4"),
  )
})

test("Stage 17 keeps adjudication private and returns only public roll outcome to the player", () => {
  const sql = baseMigration()
  assert.match(sql, /revoke all on table public\.ai_player_intent_adjudications/)
  assert.match(sql, /using \(false\)/)
  assert.match(sql, /v_private_result := v_private_result \|\| jsonb_build_object/)
  assert.match(sql, /return v_public_result/)
  assert.match(sql, /'outcomeEnvelope'/)
  assert.match(sql, /'receiptFingerprint'/)
})

test("Stage 17 world creation remains a materializer responsibility, not a player-roll responsibility", () => {
  const code = runtime()
  assert.match(code, /world_materialization_task/)
  assert.match(code, /runWorldMaterializer/)
  assert.match(code, /Player d20 никогда не создаёт отсутствующую хижину/)
  assert.match(code, /СНАЧАЛА используй resolve_random_decision/)
  assert.match(code, /payload\.stage17_world_existence/)
})


test("Stage 17 deterministic success/failure produces an immutable no-roll receipt", () => {
  const code = runtime()
  const sql = migration()

  assert.match(code, /intent_adjudication/)
  assert.match(code, /deterministic_success/)
  assert.match(code, /deterministic_failure/)
  assert.match(code, /persistStage17DeterministicAdjudication/)
  assert.match(sql, /record_ai_gm_deterministic_adjudication_v1/)
  assert.match(sql, /natural_20_policy/)
  assert.match(sql, /'not_applicable'/)
  assert.match(sql, /v_mode='deterministic_success'/)
  assert.match(sql, /v_mode='deterministic_failure'/)
})

test("Stage 17 deterministic adjudication never creates a pending d20", () => {
  const sql = migration()
  const start = sql.indexOf("create or replace function public.record_ai_gm_deterministic_adjudication_v1")
  const end = sql.indexOf("revoke all on function public.record_ai_gm_deterministic_adjudication_v1", start)
  assert.ok(start >= 0)
  assert.ok(end > start)

  const block = sql.slice(start, end)
  assert.doesNotMatch(block, /create_ai_gm_player_roll_request_v1/)
  assert.doesNotMatch(block, /send_chat_roll_v4/)
  assert.match(block, /insert into public\.ai_player_intent_adjudications/)
})

test("Stage 17 deterministic world outcomes require real proof", () => {
  const sql = migration()

  assert.match(sql, /stage17_world_success_requires_canonical_or_resolver_exists_proof/)
  assert.match(sql, /stage17_world_failure_requires_canonical_or_resolver_absent_proof/)
  assert.match(sql, /resolver_absent/)
})


test("Stage 17 deterministic no-roll outcomes are persisted with the same proof boundary", () => {
  const sql = proofMigration()
  const code = runtime()

  assert.match(sql, /record_ai_gm_deterministic_adjudication_v1/)
  assert.match(sql, /deterministic_success/)
  assert.match(sql, /deterministic_failure/)
  assert.match(sql, /resolver_absent/)
  assert.match(sql, /natural_20_policy[\s\S]*not_applicable/)
  assert.match(code, /intent_adjudication/)
  assert.match(code, /persistStage17DeterministicAdjudication/)
  assert.match(code, /record_ai_gm_deterministic_adjudication_v1/)
})

test("Stage 17 receipt sequence is shared by deterministic and roll adjudications", () => {
  const sql = proofMigration()
  const matches = sql.match(
    /select coalesce\(max\(sequence_no\),0\)\+1 into v_sequence\s+from public\.ai_player_intent_adjudications\s+where gm_job_id=p_job_id;/g,
  )
  assert.equal(matches?.length, 2)
})

test("Stage 17 proof kinds include explicit resolver absence for deterministic failure", () => {
  const sql = proofMigration()
  assert.match(
    sql,
    /world_proof_kind in \([\s\S]*'resolver_exists'[\s\S]*'resolver_absent'[\s\S]*'impossible_exact'/,
  )
  assert.match(sql, /stage17_world_failure_requires_canonical_or_resolver_absent_proof/)
})
