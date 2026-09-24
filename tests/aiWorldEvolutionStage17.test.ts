import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = () =>
  read("supabase/migrations/20260924071000_ai_world_evolution_stage17_logic_rolls_v1.sql")

const runtime = () =>
  read("supabase/functions/voss-agent/game-chat-runtime.ts")

test("Stage 17 persists an immutable pre-roll adjudication receipt", () => {
  const sql = migration()

  assert.match(sql, /create table if not exists public\.ai_player_intent_adjudications/)
  assert.match(sql, /source_intent_fingerprint/)
  assert.match(sql, /evidence_fingerprint/)
  assert.match(sql, /receipt_fingerprint/)
  assert.match(sql, /adjudication_mode in \([\s\S]*'deterministic_success'[\s\S]*'deterministic_failure'[\s\S]*'check'[\s\S]*'impossible_exact'/)
  assert.match(sql, /ai_player_intent_adjudications_immutable_update/)
  assert.match(sql, /ai_player_intent_adjudication_is_immutable/)
  assert.match(sql, /pending_player_roll_requests[\s\S]*adjudication_id/)
  assert.match(sql, /pending_player_roll_requests_stage17_freeze/)
  assert.match(sql, /stage17_player_roll_contract_is_frozen/)
})

test("Stage 17 keeps hidden adjudication state service-only", () => {
  const sql = migration()

  assert.match(
    sql,
    /alter table public\.ai_player_intent_adjudications enable row level security/,
  )
  assert.match(
    sql,
    /revoke all on table public\.ai_player_intent_adjudications[\s\S]*from public, anon, authenticated/,
  )
  assert.match(sql, /ai_player_intent_adjudications_no_direct_reads/)
  assert.match(sql, /using \(false\)/)
  assert.match(
    sql,
    /revoke all on function public\.create_ai_gm_player_roll_request_v2[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    sql,
    /grant execute on function public\.create_ai_gm_player_roll_request_v2[\s\S]*to service_role/,
  )
})

test("Stage 17 freezes logical difficulty before delegating to the real Stage 5 roll", () => {
  const sql = migration()

  assert.match(sql, /private\.ai_gm_difficulty_dc_v1/)
  assert.match(sql, /when 'very_easy' then 5/)
  assert.match(sql, /when 'easy' then 10/)
  assert.match(sql, /when 'moderate' then 15/)
  assert.match(sql, /when 'hard' then 20/)
  assert.match(sql, /when 'very_hard' then 25/)
  assert.match(sql, /when 'nearly_impossible' then 30/)
  assert.match(sql, /insert into public\.ai_player_intent_adjudications[\s\S]*v_receipt_fingerprint/)
  assert.match(sql, /public\.create_ai_gm_player_roll_request_v1\(/)
  assert.match(sql, /set adjudication_id = v_receipt\.id/)
})

test("Stage 17 impossible_exact can never become exact success", () => {
  const sql = migration()
  const impossibleStart = sql.indexOf(
    "elsif v_adjudication.adjudication_mode = 'impossible_exact'",
  )
  const impossibleEnd = sql.indexOf(
    "else\n      raise exception 'stage17_roll_has_non_roll_adjudication'",
    impossibleStart,
  )
  assert.ok(impossibleStart >= 0)
  assert.ok(impossibleEnd > impossibleStart)

  const block = sql.slice(impossibleStart, impossibleEnd)
  assert.match(block, /v_outcome_class := 'partial_success'/)
  assert.match(block, /v_outcome_class := 'failure'/)
  assert.doesNotMatch(block, /v_outcome_class := 'success'/)
  assert.match(sql, /'natural20', v_d20_raw = 20/)
  assert.match(sql, /'natural20Policy', v_adjudication\.natural_20_policy/)
})

test("Stage 17 primary GM emits semantics, not application roll API fields", () => {
  const code = runtime()

  assert.match(code, /semantic_check/)
  assert.match(code, /logical_difficulty/)
  assert.match(code, /adjudication_mode\(check\|impossible_exact\)/)
  assert.match(code, /НЕ указывай request_type\/ability_key\/skill_key\/attack_kind\/modifier/)
  assert.match(code, /Player d20 никогда не создаёт отсутствующую хижину, дракона, NPC, предмет или улику/)
  assert.match(code, /Не проси косметический бросок/)
  assert.match(code, /крепкий алкоголь может требовать Constitution check\/save/)
})

test("Stage 17 delegates semantic mechanics to a bounded junior worker", () => {
  const code = runtime()

  assert.match(code, /MECHANIC_WORKER_MODEL_KEY = "deepseek-v4\.1-flash"/)
  assert.match(code, /MECHANIC_WORKER_SYSTEM/)
  assert.match(code, /normalizePlayerRollWithWorker/)
  assert.match(code, /STAGE17_SKILLS/)
  assert.match(code, /STAGE17_ABILITIES/)
  assert.match(code, /temperature: 0\.05/)
  assert.match(code, /create_ai_gm_player_roll_request_v2/)
  assert.doesNotMatch(
    code.slice(
      code.indexOf('"Для request_player_roll НЕ указывай'),
      code.indexOf('"Для mechanic modes body пустой'),
    ),
    /request_type\(skill/,
  )
})

test("Stage 17 worker gets canonical proficiency state while server still owns modifier math", () => {
  const context = read("supabase/functions/voss-agent/game-chat-context.ts")
  const stage5 = read(
    "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
  )

  assert.match(context, /skill_proficiencies/)
  assert.match(context, /saving_throw_proficiencies/)
  assert.match(stage5, /resolve_player_roll_modifier_v1/)
  assert.match(stage5, /skill_ability_v1/)
  assert.match(stage5, /proficiency_bonus/)
})

test("Stage 17 resume feeds the primary GM the frozen server outcome envelope", () => {
  const code = runtime()
  const sql = migration()

  assert.match(code, /SERVER-RESOLVED ROLL RESULT/)
  assert.match(code, /claimed\.result\.last_roll_result/)
  assert.match(sql, /'outcomeEnvelope', v_outcome_envelope/)
  assert.match(sql, /'exactGoalAllowed', v_adjudication\.exact_goal_allowed/)
  assert.match(sql, /'receiptFingerprint', v_adjudication\.receipt_fingerprint/)
})

test("Stage 17 remains separate from Stage 11 world-existence randomness", () => {
  const code = runtime()
  const roadmap = read("docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md")

  assert.match(code, /СНАЧАЛА используй resolve_random_decision/)
  assert.match(code, /World existence и character performance/)
  assert.match(roadmap, /World existence is not a skill check/)
  assert.match(roadmap, /Stage 11 Resolver settles existence first/)
})
