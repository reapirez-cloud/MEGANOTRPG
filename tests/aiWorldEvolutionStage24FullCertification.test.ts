import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  AI_WORLD_EVOLUTION_STAGES,
  validateAiWorldEvolutionContract,
} from "../src/ai-world-evolution/contract.ts"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const liveSmoke = read(
  "supabase/tests/ai_world_evolution_stage24_full_certification.sql",
)
const resolver = read(
  "supabase/migrations/20260923170205_ai_world_evolution_stage1_resolver_v1.sql",
)
const backgroundSchema = read(
  "supabase/migrations/20260923171818_ai_world_evolution_stage2_background_schema_v1.sql",
)
const dailyCandidates = read(
  "supabase/migrations/20260923204623_ai_world_evolution_stage9_daily_candidate_resolver_v1.sql",
)
const promotion = read(
  "supabase/migrations/20260923194814_ai_world_evolution_stage8_scene_actor_promotion_v1.sql",
)
const promotionHandoff = read(
  "supabase/migrations/20260924055547_ai_world_evolution_stage15_promotion_handoff_and_party_sync_v1.sql",
)
const retention = read(
  "supabase/migrations/20260924061250_ai_world_evolution_stage16_scene_actor_retention_v1.sql",
)
const rollStage5 = read(
  "supabase/migrations/20260923103000_ai_gm_player_roll_stage5_v1.sql",
)
const rollStage17 = read(
  "supabase/migrations/20260924143055_ai_world_evolution_stage17_bound_proof_and_replay_v3.sql",
)
const postTurn = read(
  "supabase/migrations/20260924145628_ai_world_evolution_stage18_clean_rebuild_v3.sql",
)
const boundedContext = read(
  "supabase/migrations/20260924152250_ai_world_evolution_stage19_bounded_chat_context_v1.sql",
)
const identityFoundation = read(
  "supabase/migrations/20260924160417_ai_world_evolution_stage20_npc_identity_foundation_v1.sql",
)
const identityConsumers = read(
  "supabase/migrations/20260924160554_ai_world_evolution_stage20_identity_consumers_v1.sql",
)
const behaviorProfiles = read(
  "supabase/migrations/20260924164738_ai_world_evolution_stage21_gm_behavior_profiles_v1.sql",
)
const directorPreferences = read(
  "supabase/migrations/20260924180500_ai_world_evolution_stage22_player_director_preferences_v1.sql",
)
const adultContent = read(
  "supabase/migrations/20260924180941_ai_world_evolution_stage23_adult_life_sim_content_profile_v1.sql",
)
const interruptibleTurns = read(
  "supabase/migrations/20260924183500_ai_gm_interruptible_player_turn_and_npc_leverage_v1.sql",
)
const isolation = read(
  "supabase/migrations/20260923152912_ai_world_campaign_isolation_v1.sql",
)

const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const background = read("supabase/functions/voss-agent/background-world.ts")
const composer = read("src/ui-v1-isolated/chat-room/ChatComposer.tsx")
const turnStatus = read("src/ui-v1-isolated/chat-room/AiGmTurnStatus.tsx")
const roadmap = read("docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md")

const maintenanceRegression = read("tests/aiGmWorldMaintenanceStage3.test.ts")
const questRegression = read("tests/questAiGmStage5.test.ts")
const questBridgeRegression = read("tests/questWorldBridgeStage6.test.ts")
const restRegression = read("tests/chatPostRestPreparationIntegration.test.ts")
const isolationRegression = read("tests/aiWorldCampaignIsolation.test.ts")
const leverageRegression = read(
  "tests/aiGmInterruptiblePlayerTurnAndNpcLeverage.test.ts",
)

test("Stage 24 has a real rollback-only live certification, not a checklist", () => {
  assert.match(liveSmoke, /^-- Stage 24 live certification smoke/m)
  assert.match(liveSmoke, /begin;/)
  assert.match(liveSmoke, /rollback;/)
  assert.match(liveSmoke, /generate_series\(1,205\)/)
  assert.match(liveSmoke, /for i in 1\.\.500 loop/)
  assert.match(liveSmoke, /resolve_ai_background_daily_candidates_v1/)
  assert.match(liveSmoke, /sync_colocated_player_time_v1/)
  assert.match(liveSmoke, /read_ai_gm_recent_chat_context_v1/)
  assert.match(liveSmoke, /message_count'\)::integer=45/)
  assert.match(liveSmoke, /context_limit'\)::integer=50/)
  assert.match(liveSmoke, /stage24_human_campaign_wrongly_entered_ai_background/)
  assert.match(liveSmoke, /stage24_candidate_replay_changed_selection/)
  assert.match(liveSmoke, /stage24_context_did_not_keep_latest_50/)
})

test("Stage 24 keeps Resolver, 30 percent selection, promotion and retention one chain", () => {
  assert.match(resolver, /unique \(campaign_id, decision_key\)/)
  assert.match(resolver, /pg_advisory_xact_lock/)
  assert.match(dailyCandidates, /background:day:%s:select:npc:%s/)
  assert.match(dailyCandidates, /p_sides=>100/)
  assert.match(dailyCandidates, /matched_outcome_key/)
  assert.match(liveSmoke, /c\.selected is distinct from \(c\.selection_roll<=30\)/)

  assert.match(promotion, /promoted_character_id/)
  assert.match(promotionHandoff, /ai_scene_actor_stage15_background_handoff/)
  assert.match(promotionHandoff, /backgroundSimulationEligible/)
  assert.match(dailyCandidates, /from public\.npc_profiles np/)
  assert.doesNotMatch(dailyCandidates, /from public\.ai_scene_actors/)
  assert.match(retention, /promoted_handoff_snapshot_missing/)
  assert.match(retention, /retention_state='compacted'/)
})

test("Stage 24 certifies split-party time without hidden offscreen heroics", () => {
  assert.match(promotionHandoff, /sync_colocated_player_time_v1/)
  assert.match(promotionHandoff, /catchup_kind text not null default 'idle_life'/)
  assert.match(promotionHandoff, /meaningful_actions boolean not null default false/)
  assert.match(promotionHandoff, /'major_successes',false/)
  assert.match(promotionHandoff, /'offscreen_heroics',false/)
  assert.match(liveSmoke, /catchup_kind='idle_life'/)
  assert.match(liveSmoke, /meaningful_actions=false/)
})

test("Stage 24 keeps logic-bound fiction separate from real player d20 mechanics", () => {
  assert.match(runtime, /create_ai_gm_player_roll_request_v4/)
  assert.match(runtime, /record_ai_gm_deterministic_adjudication_v2/)
  assert.match(runtime, /SERVER-RESOLVED ROLL RESULT/)
  assert.match(rollStage5, /resolve_player_roll_modifier_v1/)
  assert.match(rollStage5, /resolve_player_roll_request_v1/)
  assert.match(rollStage5, /send_chat_roll_v4/)
  assert.match(rollStage17, /stage17_pending_roll_replay_contract_mismatch/)
  assert.match(rollStage17, /canonical_evidence is distinct from v_validated_evidence/)
  assert.match(runtime, /impossible_exact/)
  assert.match(runtime, /натуральная 20/i)
})

test("Stage 24 keeps final answer, junior commit and player gate in the correct order", () => {
  assert.match(postTurn, /finalize_ai_gm_turn_v3/)
  assert.match(postTurn, /ai_gm_post_turn_locked/)
  assert.match(postTurn, /execute_ai_gm_post_turn_mutation_v3/)
  assert.match(runtime, /claim_ai_gm_post_turn_commit_v3/)
  assert.match(runtime, /execute_ai_gm_post_turn_mutation_v3/)
  assert.match(runtime, /The commit is terminal now/)
  assert.match(turnStatus, /get_ai_gm_room_status_v3/)
  assert.match(turnStatus, /Младший шуршит/)
  assert.match(composer, /aiGmTurnBlocked/)
  assert.match(composer, /presentation\.canCompose[\s\S]*aiGmTurnBlocked/)
})

test("Stage 24 includes the new interruptible player plan in the certified turn pipeline", () => {
  assert.match(interruptibleTurns, /plan_entries jsonb not null default '\[\]'::jsonb/)
  assert.match(interruptibleTurns, /execute_ai_gm_player_turn_next_v1/)
  assert.match(interruptibleTurns, /execute_ai_gm_player_turn_reaction_v1/)
  assert.match(interruptibleTurns, /settle_ai_gm_player_turn_plan_v1/)
  assert.match(runtime, /естественное право вмешаться/)
  assert.match(runtime, /НЕ исполняй остаток плана/)
  assert.match(leverageRegression, /player_turn_requires_one_execution_tool_per_provider_round/)
})

test("Stage 24 proves long rooms stay bounded and worker chatter stays out", () => {
  assert.match(boundedContext, /least\(coalesce\(p_limit,50\),50\)/)
  assert.match(context, /const CHAT_CONTEXT_LIMIT = 50/)
  assert.match(context, /MAX_RECENT_MESSAGE_JSON_BYTES = 48_000/)
  assert.match(context, /MAX_PROMPT_CONTEXT_JSON_BYTES = 160_000/)
  assert.match(liveSmoke, /for i in 1\.\.500 loop/)
  assert.match(liveSmoke, /jsonb_array_length\(v_context->'messages'\)<>50/)
  assert.match(liveSmoke, /history-451/)
  assert.match(liveSmoke, /octet_length\(v_context::text\)>60000/)
})

test("Stage 24 keeps one stable NPC identity across dialogue, GM and background", () => {
  assert.match(identityFoundation, /npc_identity_fingerprints/)
  assert.match(identityFoundation, /npc_identity_fingerprint_versions/)
  assert.match(identityConsumers, /impossible_exact/)
  assert.match(context, /npcIdentityFingerprint/)
  assert.match(runtime, /identity_fingerprint/)
  assert.match(background, /identity_fingerprint/)
  assert.match(interruptibleTurns, /fill_missing_stable_dimensions_only/)
  assert.match(runtime, /situational leverage analysis/)
  assert.match(runtime, /no_leverage/)
  assert.match(runtime, /blocked_by_identity/)
})

test("Stage 24 certifies configuration as style guidance, never canon authority", () => {
  assert.match(behaviorProfiles, /gm_behavior_profiles/)
  assert.match(runtime, /gm_behavior_profile/)
  assert.match(runtime, /player intent/i)

  assert.match(directorPreferences, /ai_player_director_preferences/)
  assert.match(context, /directorPreferences/)
  assert.match(runtime, /player_director_preferences/)
  assert.match(runtime, /future/i)

  assert.match(adultContent, /'off','allowed','adult_focused'/)
  assert.match(runtime, /content_profile/)
  assert.match(runtime, /не меняет consent/i)
  assert.match(runtime, /не меняет канон/i)
})

test("Stage 24 retains human-GM, maintenance, quest and rest regressions", () => {
  assert.match(isolation, /private\.is_ai_world_campaign_v1/)
  assert.match(isolationRegression, /fail-closed outside AI worlds/)
  assert.match(liveSmoke, /human_campaign_time_sync_not_isolated/)

  assert.match(maintenanceRegression, /45-message window/)
  assert.match(maintenanceRegression, /context_limit/)
  assert.match(questRegression, /test\(/)
  assert.match(questBridgeRegression, /test\(/)
  assert.match(restRegression, /test\(/)
})

test("Stage 24 closes the 24-stage contract only with all certification artifacts present", () => {
  assert.deepEqual(validateAiWorldEvolutionContract(), [])
  assert.equal(AI_WORLD_EVOLUTION_STAGES.length, 24)
  assert.equal(
    AI_WORLD_EVOLUTION_STAGES.find((stage) => stage.id === 24)?.status,
    "certified",
  )
  assert.equal(
    AI_WORLD_EVOLUTION_STAGES.some((stage) => stage.status === "planned"),
    false,
  )
  assert.match(roadmap, /## Stage 24 — Full certification/)
  assert.match(roadmap, /\*\*Status: CERTIFIED — 2026-09-24\*\*/)
  assert.match(roadmap, /205\+ persistent NPC candidates/)
  assert.match(roadmap, /500-message/)
})
