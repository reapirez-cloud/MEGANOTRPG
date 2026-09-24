import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const foundation = readFileSync(
  new URL("../supabase/migrations/20260924160417_ai_world_evolution_stage20_npc_identity_foundation_v1.sql", import.meta.url),
  "utf8",
)
const consumers = readFileSync(
  new URL("../supabase/migrations/20260924160554_ai_world_evolution_stage20_identity_consumers_v1.sql", import.meta.url),
  "utf8",
)
const guardFix = readFileSync(
  new URL("../supabase/migrations/20260924161049_ai_world_evolution_stage20_identity_guard_fix_v1.sql", import.meta.url),
  "utf8",
)
const hardening = readFileSync(
  new URL("../supabase/migrations/20260924162355_ai_world_evolution_stage20_identity_hardening_v2.sql", import.meta.url),
  "utf8",
)
const invokerFix = readFileSync(
  new URL("../supabase/migrations/20260924162504_ai_world_evolution_stage20_dossier_invoker_fix_v3.sql", import.meta.url),
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
const sectionData = readFileSync(
  new URL("../src/ui-v1-isolated/useUiV1SectionData.ts", import.meta.url),
  "utf8",
)
const screens = readFileSync(
  new URL("../src/ui-v1-isolated/SectionScreens.tsx", import.meta.url),
  "utf8",
)
const styles = readFileSync(
  new URL("../src/ui-v1-isolated/section-screens.css", import.meta.url),
  "utf8",
)
const contract = readFileSync(
  new URL("../src/ai-world-evolution/contract.ts", import.meta.url),
  "utf8",
)

function sourceBlock(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, `missing block: ${start}`)
  return source.slice(from, to)
}

test("Stage 20 contract is implemented", () => {
  const start = contract.indexOf("id: 20,")
  const end = contract.indexOf("id: 21,", start)
  assert.ok(start >= 0 && end > start)
  assert.match(contract.slice(start, end), /status: "implemented"/)
})

test("Stage 20 has separate current, version, evolution and observation stores", () => {
  assert.match(foundation, /create table public\.npc_identity_fingerprints/)
  assert.match(foundation, /create table public\.npc_identity_fingerprint_versions/)
  assert.match(foundation, /create table public\.npc_identity_evolution_receipts/)
  assert.match(foundation, /create table public\.npc_identity_observations/)
  for (const field of [
    "traits",
    "weighted_values",
    "red_lines",
    "long_term_desires",
    "fears",
    "loyalties",
    "authority_attitude",
    "risk_tolerance",
    "violence_threshold",
    "pressure_behavior",
    "self_image",
    "social_style",
    "decision_priorities",
  ]) {
    assert.match(foundation, new RegExp(`\\b${field}\\b`))
  }
})

test("stable identity schema rejects mutable state and arbitrary keys", () => {
  const normalize = sourceBlock(
    foundation,
    "create or replace function private.normalize_npc_identity_core_v1",
    "create or replace function private.npc_identity_hash_v1",
  )
  assert.match(normalize, /npc_identity_core_unknown_key/)
  for (const forbidden of [
    "'mood'",
    "'current_hp'",
    "'location_id'",
    "'relationship_score'",
    "'recent_anger'",
  ]) {
    assert.equal(normalize.includes(forbidden), false, forbidden)
  }
})

test("direct current-identity updates are fail closed", () => {
  assert.match(
    guardFix,
    /coalesce\(current_setting\('meganot\.npc_identity_versioned_write',true\),''\)<>'on'/,
  )
  assert.match(guardFix, /npc_identity_direct_update_forbidden/)
  assert.match(foundation, /npc_identity_versions_immutable/)
})

test("identity evolution requires a major canonical event and optimistic version", () => {
  const evolve = sourceBlock(
    foundation,
    "create or replace function public.evolve_npc_identity_fingerprint_v1",
    "create or replace function public.record_npc_identity_observation_v1",
  )
  assert.match(evolve, /current_version<>p_expected_version/)
  assert.match(evolve, /v_event\.importance<4/)
  assert.match(evolve, /npc_identity_major_event_must_involve_npc/)
  assert.match(evolve, /npc_identity_major_event_requires_identity_change/)
  assert.match(evolve, /npc_identity_evolution_receipts/)
})

test("profile bootstrap is one-way seed, not ordinary-update personality drift", () => {
  assert.match(foundation, /create trigger seed_npc_identity_after_profile_v1\s+after insert on public\.npc_profiles/)
  assert.doesNotMatch(foundation, /seed_npc_identity_after_profile_v1[\s\S]{0,100}after update/)
  assert.match(foundation, /explicit_npc_profile_fields/)
})

test("promotion bootstraps conservatively from established actor provenance", () => {
  const promotion = sourceBlock(
    foundation,
    "create or replace function private.bootstrap_promoted_npc_identity_v1",
    "create trigger bootstrap_promoted_npc_identity_v1",
  )
  assert.match(promotion, /ai_scene_actor_command_receipts/)
  assert.match(promotion, /ai_scene_actor_damage_receipts/)
  assert.match(promotion, /source_bestiary_slug/)
  assert.match(promotion, /conservative_no_unobserved_biography/)
  assert.match(promotion, /'bootstrap_refinement'/)
  assert.match(promotion, /'scene_actor_promotion'/)
})

test("all AI NPC surfaces consume the same current fingerprint", () => {
  assert.match(context, /read_ai_npc_identity_fingerprints_v1/)
  assert.match(context, /present_npc_identity_fingerprints/)
  assert.match(context, /identity_fingerprint: identity/)
  assert.match(runtime, /npc_identity_fingerprints: context\.npcIdentities/)
  assert.match(runtime, /hard red_lines/)
  assert.match(runtime, /impossible_exact/)
  assert.match(consumers, /'identity_fingerprint'/)
  assert.match(consumers, /private\.npc_identity_core_from_current_v1/)
})

test("background worker cannot smuggle identity drift through proposed state", () => {
  assert.match(background, /identity_fingerprint является стабильным/)
  for (const forbidden of [
    '"identity_fingerprint"',
    '"red_lines"',
    '"weighted_values"',
    '"decision_priorities"',
    '"self_image"',
  ]) {
    assert.equal(background.includes(forbidden), true, forbidden)
  }
})

test("player observations are separate and canonical fingerprint stays GM-private", () => {
  assert.match(foundation, /npc_identity_observations_manager_or_observer_read/)
  assert.match(consumers, /read_world_npc_dossier_v2/)
  assert.match(consumers, /if v_can_manage then/)
  assert.match(consumers, /identity_fingerprint/)
  assert.match(consumers, /observed_identity/)
  assert.match(sectionData, /read_world_npc_dossier_v2/)
})

test("GM NPC dossier exposes a dedicated identity surface", () => {
  assert.match(screens, />Личность</)
  assert.match(screens, /Красные линии/)
  assert.match(screens, /Приоритет решений/)
  assert.match(screens, /identityFingerprint\.version/)
  assert.match(styles, /\.u1-npc-identity/)
  assert.match(styles, /\.u1-npc-identity__red-lines/)
})


test("Stage 20 hardening rejects anonymous-sign-in access and uses invoker dossier", () => {
  assert.match(hardening, /auth\.jwt\(\)->>'is_anonymous'/)
  assert.match(hardening, /security invoker/i)
  assert.match(invokerFix, /security invoker/i)
  assert.match(invokerFix, /permanent_user_required/)
  assert.match(invokerFix, /from public\.characters c/)
  assert.match(invokerFix, /from public\.campaign_members cm/)
})

test("Stage 20 hardening covers new foreign keys with indexes", () => {
  for (const indexName of [
    "npc_identity_versions_campaign_idx",
    "npc_identity_evolution_campaign_idx",
    "npc_identity_fingerprints_last_major_event_idx",
    "npc_identity_observations_campaign_idx",
    "npc_identity_observations_source_event_idx",
  ]) {
    assert.match(hardening, new RegExp(indexName))
  }
})
