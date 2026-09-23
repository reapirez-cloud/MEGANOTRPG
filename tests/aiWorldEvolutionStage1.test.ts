import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { AI_WORLD_EVOLUTION_STAGES } from "../src/ai-world-evolution/contract.ts"

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260923170205_ai_world_evolution_stage1_resolver_v1.sql",
)
const sql = fs.readFileSync(migrationPath, "utf8")

test("AI world evolution Stage 1 is certified only with concrete resolver artifacts", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 1)
  assert.ok(stage)
  assert.equal(stage.status, "certified")

  assert.match(sql, /create table if not exists public\.ai_world_random_receipts/)
  assert.match(sql, /unique \(campaign_id, decision_key\)/)
  assert.match(sql, /create or replace function public\.resolve_world_random_v1/)
  assert.match(sql, /private\.is_ai_world_campaign_v1\(p_campaign_id\)/)
  assert.match(sql, /campaign_day integer/)
  assert.match(sql, /run_key text/)
  assert.match(sql, /target_scope text/)
  assert.match(sql, /target_id text/)
  assert.match(sql, /audit jsonb/)
})

test("World Resolver uses rejection sampling over cryptographic bytes instead of modulo-biased sampling", () => {
  assert.match(sql, /extensions\.gen_random_bytes\(4\)/)
  assert.match(sql, /v_range constant bigint := 4294967296/)
  assert.match(sql, /v_limit := v_range - mod\(v_range, p_sides::bigint\)/)
  assert.match(sql, /exit when v_value < v_limit/)
  assert.match(sql, /return \(mod\(v_value, p_sides::bigint\) \+ 1\)::integer/)
})

test("World Resolver commits valid outcome bands before rolling and rejects semantic key reuse", () => {
  const normalizePos = sql.indexOf(
    "v_bands := private.normalize_world_random_bands_v1(p_sides, p_bands)",
  )
  const rollPos = sql.indexOf("v_result := private.secure_world_roll_dn_v1(p_sides)")
  assert.ok(normalizePos >= 0)
  assert.ok(rollPos > normalizePos)

  assert.match(sql, /world_random_bands_must_be_ordered_gapless_nonoverlapping/)
  assert.match(sql, /world_random_bands_must_cover_all_results/)
  assert.match(sql, /request_fingerprint/)
  assert.match(sql, /world_random_decision_key_conflict/)
  assert.match(sql, /pg_advisory_xact_lock/)
})

test("World Resolver receipts are server-only and cannot be rerolled by mutation", () => {
  assert.match(
    sql,
    /revoke all on table public\.ai_world_random_receipts from public, anon, authenticated, service_role/,
  )
  assert.match(
    sql,
    /grant select, insert on table public\.ai_world_random_receipts to service_role/,
  )
  assert.doesNotMatch(
    sql,
    /grant[^;]*(?:update|delete)[^;]*ai_world_random_receipts[^;]*service_role/i,
  )

  assert.match(
    sql,
    /revoke all on function public\.resolve_world_random_v1[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    sql,
    /grant execute on function public\.resolve_world_random_v1[\s\S]*to service_role/,
  )

  const resolverBody = sql.slice(sql.indexOf("create or replace function public.resolve_world_random_v1"))
  assert.doesNotMatch(resolverBody, /update public\.ai_world_random_receipts/i)
  assert.doesNotMatch(resolverBody, /delete from public\.ai_world_random_receipts/i)
})
