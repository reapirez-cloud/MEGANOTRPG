import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const resolver = read("supabase/functions/voss-agent/random-decision.ts")
const control = read("src/ui-v1-isolated/AiGmControl.tsx")
const migration = read(
  "supabase/migrations/20260925090000_ai_gm_stage25_causal_hardening_v1.sql",
)

test("Stage 25 keeps settings-load failure distinct from non-AI campaign", () => {
  assert.match(control, /error && !panel/)
  assert.match(control, /Не удалось загрузить настройки ИИ-ГМ/)
  assert.match(control, /!panel\?\.ai_world/)
  assert.match(migration, /grant execute on function private\.can_select_campaign_junior_model_v1\(uuid\)[\s\S]*authenticated/)
  assert.match(
    migration,
    /grant execute on function private\.ai_gm_behavior_profile_json_v1\(text\)[\s\S]*authenticated/,
  )
})

test("Stage 25 projects explicit source-character knowledge", () => {
  assert.match(context, /character_location_discoveries/)
  assert.match(context, /character_npc_discoveries/)
  assert.match(context, /sourceKnowledge/)
  assert.match(context, /source_character_knowledge/)
  assert.match(context, /player_claims_do_not_expand_character_knowledge/)
  assert.match(context, /unknown_specific_player_targets_cannot_seed_world_discovery/)
})

test("Stage 25 forces second-person source-PC narration", () => {
  assert.match(runtime, /Повествование о source_character веди во втором лице/)
  assert.match(runtime, /«ты идёшь»/)
  assert.match(runtime, /не пиши про source_character/i)
})

test("Stage 25 blocks unknown specific player claims from Resolver", () => {
  assert.match(resolver, /player_specific_claim/)
  assert.match(resolver, /canonical_evidence_ids/)
  assert.match(resolver, /random_decision_player_specific_claim_unknown/)
  assert.match(runtime, /не превращай эту формулировку в шанс существования желаемого объекта/)
})

test("Stage 25 server-caps world-discovery rarity", () => {
  assert.match(resolver, /DISCOVERY_MAX_PRESENT_PERCENT/)
  assert.match(resolver, /mundane: 65/)
  assert.match(resolver, /uncommon: 25/)
  assert.match(resolver, /rare: 8/)
  assert.match(resolver, /exceptional: 2/)
  assert.match(resolver, /legendary: 1/)
  assert.match(resolver, /random_decision_discovery_probability_too_high/)
  assert.match(resolver, /target_present/)
})

test("Stage 25 makes regenerate and repeated search reuse committed uncertainty", () => {
  assert.match(runtime, /runKey: `source:\$\{sourceMessageId\}`/)
  assert.match(resolver, /decisionKind === "world_discovery"/)
  assert.match(resolver, /String\(context\.campaignDay\)/)
  assert.match(resolver, /searchCategory/)
  assert.match(resolver, /decisionLocalKey = "discovery_pool"/)
  assert.match(runtime, /тот же discovery pool/)
})


test("Stage 25 makes every regenerate prose-only, not only resolved-d20 replays", () => {
  assert.match(runtime, /priorResolverRunsForRegenerate/)
  assert.match(runtime, /regenerateCanonLocked/)
  assert.match(runtime, /REGENERATION CANON LOCK/)
  assert.match(
    runtime,
    /replayMechanicsLocked \|\| resolvedRollContinuationLocked \|\| regenerateCanonLocked/,
  )
  assert.match(runtime, /JSON\.stringify\(inheritedResolverRuns/)
  assert.match(runtime, /replayMechanicsLocked \|\| regenerateCanonLocked/)
})
