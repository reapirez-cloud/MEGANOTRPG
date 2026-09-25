import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const foundation = readFileSync(
  new URL("../supabase/migrations/20260924164738_ai_world_evolution_stage21_gm_behavior_profiles_v1.sql", import.meta.url),
  "utf8",
)
const bootstrap = readFileSync(
  new URL("../supabase/migrations/20260924165338_ai_world_evolution_stage21_profile_bootstrap_v2.sql", import.meta.url),
  "utf8",
)
const security = readFileSync(
  new URL("../supabase/migrations/20260924165849_ai_world_evolution_stage21_behavior_security_v3.sql", import.meta.url),
  "utf8",
)
const modeSemantics = readFileSync(
  new URL("../supabase/migrations/20260925113000_ai_gm_immersive_presentation_and_mode_semantics_v1.sql", import.meta.url),
  "utf8",
)
const context = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-context.ts", import.meta.url),
  "utf8",
)
const runtime = readFileSync(
  new URL("../supabase/functions/voss-agent/game-chat-runtime.ts", import.meta.url),
  "utf8",
)
const background = readFileSync(
  new URL("../supabase/functions/voss-agent/background-world.ts", import.meta.url),
  "utf8",
)
const shell = readFileSync(
  new URL("../src/ai/AgentShell.tsx", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, `missing block: ${start}`)
  return source.slice(from, to)
}

test("Stage 21 contract is implemented", () => {
  const start = contract.indexOf("id: 21,")
  const end = contract.indexOf("id: 22,", start)
  assert.ok(start >= 0 && end > start)
  assert.match(contract.slice(start, end), /status: "implemented"/)
})

test("Stage 21 persists three fixed behavior presets with explicit dimensions", () => {
  for (const key of ["brutal", "adventure", "sims"]) {
    assert.match(foundation, new RegExp(`'${key}'`))
  }
  for (const label of ["Жестокий", "Приключение", "Симс"]) {
    assert.match(foundation, new RegExp(label))
  }
  for (const dimension of [
    "consequence_strictness",
    "plot_armor_allowance",
    "lethal_escalation_pressure",
    "danger_telegraphing",
    "recoverable_complication_preference",
    "adventure_coincidence",
    "life_social_focus",
    "pacing_pressure",
    "consequence_persistence",
  ]) {
    assert.match(foundation, new RegExp(dimension))
  }
})

test("Adventure is the persisted AI-world default", () => {
  assert.match(foundation, /profile_key text not null default 'adventure'/)
  assert.match(foundation, /where private\.is_ai_world_campaign_v1\(c\.id\)/)
  assert.match(bootstrap, /'adventure'/)
  assert.match(bootstrap, /after insert or update of campaign_id/)
})

test("behavior profile mutation is AI-world-only and manager-owned", () => {
  const setter = block(
    foundation,
    "create or replace function public.set_campaign_ai_gm_behavior_profile_v1",
    "revoke all on function private.ai_gm_behavior_profile_json_v1",
  )
  assert.match(setter, /ai_gm_behavior_profile_ai_world_only/)
  assert.match(setter, /private\.is_campaign_manager/)
  assert.match(setter, /permanent_user_required/)
  assert.match(setter, /ai_gm_behavior_profile_invalid/)
})

test("shared constitution preserves canon, dice and NPC agency", () => {
  for (const invariant of [
    "player_intent_is_input_not_canon",
    "world_facts_remain_authoritative",
    "resolved_mechanics_and_dice_remain_authoritative",
    "npc_identity_and_agency_remain_authoritative",
    "profile_only_breaks_ties_between_canonically_plausible_developments",
    "profile_never_fabricates_hostility_or_success",
  ]) {
    assert.match(foundation, new RegExp(invariant))
  }
})

test("primary GM consumes Stage 21 profile but technical materializers do not", () => {
  assert.match(context, /read_ai_gm_behavior_profile_v1/)
  const prompt = block(
    context,
    "export function stage2ContextForPrompt",
    "export function stage19ContextTelemetry",
  )
  assert.equal(prompt.includes("gm_behavior_profile"), false)

  assert.match(runtime, /function primaryGmContextForPrompt/)
  assert.match(runtime, /gm_behavior_profile: context\.gmBehaviorProfile/)
  assert.match(runtime, /primaryGmContextForPrompt\(context\)/)

  const materializer = block(
    runtime,
    "async function runWorldMaterializer",
    "async function resolvePostTurnWorkerModel",
  )
  assert.match(materializer, /stage2ContextForPrompt\(context\)/)
  assert.equal(materializer.includes("primaryGmContextForPrompt"), false)

  const postTurn = block(
    runtime,
    "async function runStage18Intent",
    "async function runStage18PostTurnCommit",
  )
  assert.match(postTurn, /stage2ContextForPrompt\(context\)/)
  assert.equal(postTurn.includes("primaryGmContextForPrompt"), false)
})

test("Brutal profile is strict but explicitly non-adversarial", () => {
  const gmSystem = block(
    runtime,
    "const STAGE12_GAME_MASTER_SYSTEM",
    "function jsonRecord",
  )
  assert.match(gmSystem, /brutal\/Жестокий/)
  assert.match(gmSystem, /НИКОГДА не придумывай дополнительных врагов/)
  assert.match(gmSystem, /только чтобы наказать\/убить PC/)
  assert.match(gmSystem, /power asymmetry/i)
})

test("Brutal preserves economic scale without poverty bias", () => {
  assert.match(modeSemantics, /economic_scale/)
  assert.match(modeSemantics, /wages_prices_rewards/)
  assert.match(modeSemantics, /poverty_bias/)
  assert.match(modeSemantics, /large_windfalls/)
  assert.match(runtime, /экономика обязана сохранять масштаб мира/)
  assert.match(runtime, /Hardcore НЕ означает искусственно делать PC нищим/)
})

test("Adventure favors recoverable continuations only when equally plausible", () => {
  const gmSystem = block(
    runtime,
    "const STAGE12_GAME_MASTER_SYSTEM",
    "function jsonRecord",
  )
  assert.match(gmSystem, /adventure\/Приключение/)
  assert.match(gmSystem, /если несколько исходов действительно равно правдоподобны/)
  assert.match(gmSystem, /предупреждение, побег, сдачу, долг, соперничество, осложнение/)
})

test("Sims raises life/social focus without granting NPC compliance", () => {
  assert.match(runtime, /sims\/Симс/)
  assert.match(runtime, /Это НЕ wish fulfillment/)
  assert.match(runtime, /NPC могут отказать/)
  assert.match(foundation, /'npc_compliance_bias','forbidden'/)
  assert.match(foundation, /'ordinary_life_density','high'/)
})

test("background worker sees profile while supplied d100 remains frozen", () => {
  assert.match(background, /read_ai_gm_behavior_profile_v1/)
  assert.match(background, /gm_behavior_profile/)
  assert.match(background, /не меняет supplied d100, direction, magnitude/)
  assert.match(background, /background_worker_supplied_roll_violation/)
})

test("GM turn telemetry records the active behavior profile", () => {
  assert.match(context, /stage21_gm_behavior_profile_key/)
  assert.match(context, /stage21_gm_behavior_dimensions/)
  assert.match(runtime, /stage21BehaviorProfileTelemetry/)
})

test("AI tools drawer exposes profile selector only for AI-world campaigns", () => {
  assert.match(shell, /list_campaign_ai_gm_behavior_profiles_v1/)
  assert.match(shell, /set_campaign_ai_gm_behavior_profile_v1/)
  assert.match(shell, /gmBehavior\?\.ai_world/)
  assert.match(shell, /Режим ИИ-ГМ/)
  assert.match(shell, /Канон, кубы и характер NPC остаются неизменными/)
})


test("Stage 21 campaign profile write uses invoker RLS instead of authenticated SECURITY DEFINER", () => {
  assert.match(security, /security invoker/i)
  assert.match(security, /ai_gm_behavior_settings_manager_insert/)
  assert.match(security, /ai_gm_behavior_settings_manager_update/)
  assert.match(security, /private\.is_ai_world_campaign_v1\(campaign_id\)/)
  assert.match(security, /private\.is_campaign_manager/)
  assert.match(security, /updated_by=\(select auth\.uid\(\)\)/)
  assert.doesNotMatch(
    security,
    /set_campaign_ai_gm_behavior_profile_v1[\s\S]*?security definer/i,
  )
})

test("Stage 21 telemetry is not duplicated inside one result object", () => {
  assert.doesNotMatch(
    runtime,
    /\.\.\.stage21BehaviorProfileTelemetry\(context\),\s*\.\.\.stage21BehaviorProfileTelemetry\(context\),/,
  )
})
