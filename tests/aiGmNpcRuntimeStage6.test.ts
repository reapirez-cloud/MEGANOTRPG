import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const base = read(
  "supabase/migrations/20260923112000_ai_gm_npc_runtime_stage6_v1.sql",
)
const hardening = read(
  "supabase/migrations/20260923112500_ai_gm_npc_runtime_stage6_hardening_v1.sql",
)
const execution = read(
  "supabase/migrations/20260923113000_ai_gm_npc_runtime_stage6_execution_v1.sql",
)
const atomicSave = read(
  "supabase/migrations/20260923113500_ai_gm_npc_runtime_stage6_atomic_save_v1.sql",
)
const chatIdentity = read(
  "supabase/migrations/20260923114000_ai_gm_npc_chat_identity_bridge_v1.sql",
)
const worker = read("supabase/functions/npc-runtime/index.ts")
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")

test("Stage 6 has a durable fixed-worker NPC runtime build", () => {
  assert.match(base, /'npc_runtime_build'::text/)
  assert.match(base, /create table if not exists public\.npc_runtime_builds/)
  assert.match(base, /agent_jobs_npc_runtime_active_unique/)
  assert.match(base, /reserve_ai_gm_npc_runtime_build_v1/)
  assert.match(base, /dispatch_ai_gm_npc_runtime_build_v1/)
  assert.match(base, /queue_ai_gm_npc_runtime_after_profile_v1/)
  assert.match(worker, /WORKER_MODEL_KEY = "deepseek-v4\.1-flash"/)
  assert.match(worker, /Ты НЕ ведущий/)
})

test("NPC worker selects only an existing bestiary candidate and never invents mechanics", () => {
  assert.match(worker, /Не придумывай новые числа, атаки, заклинания или ресурсы/)
  assert.match(worker, /bestiary_catalog/)
  assert.match(worker, /const allowed = new Set/)
  assert.match(worker, /allowed\.has\(requestedSlug\)/)
  assert.match(worker, /apply_ai_gm_npc_runtime_build_v2/)
  assert.match(worker, /p_expected_signature: expectedSignature/)
})

test("Stage 6 materializes canonical sheet, CE template assignment and resources", () => {
  assert.match(base, /update public\.character_sheets/)
  assert.match(base, /insert into public\.rule_templates/)
  assert.match(base, /insert into public\.character_template_assignments/)
  assert.match(base, /insert into public\.character_resource_states/)
  assert.match(base, /private\.npc_runtime_mechanic_v1/)
  assert.match(base, /'npcRuntime',v_runtime/)
  assert.match(base, /'npc-runtime-'\|\|p_kind/)
})

test("NPC bestiary proficiencies preserve full save keys and expertise ranks", () => {
  assert.match(base, /when 'dex' then 'dexterity'/)
  assert.match(base, /when 'wis' then 'wisdom'/)
  assert.match(base, /v_skill_rank := case/)
  assert.match(base, /round\(/)
  assert.match(base, /v_skill_profs := v_skill_profs \|\| jsonb_build_object/)
  assert.match(base, /v_sheet\.skill_proficiencies->>v_skill/)
  assert.match(base, /v_sheet\.proficiency_bonus \* v_skill_rank/)
})

test("NPC limited-use resources use canonical recharge object metadata", () => {
  assert.match(
    base,
    /'\{"triggers":\["long_rest"\],"restore":"full"\}'::jsonb/,
  )
  assert.match(
    base,
    /'\{"triggers":\["special"\],"restore":"full"\}'::jsonb/,
  )
})

test("Stage 6 build signatures prevent gratuitous rebuilds and stale worker output", () => {
  assert.match(hardening, /build_signature text/)
  assert.match(hardening, /requested_signature text/)
  assert.match(hardening, /ai_gm_npc_runtime_signature_v1/)
  assert.match(hardening, /v_existing\.build_signature=v_signature/)
  assert.match(hardening, /npc_runtime_build_stale/)
  assert.match(hardening, /for update/)
  assert.match(
    hardening,
    /after insert or update of\s+role,species,creature_type,size,challenge_rating,occupation,tags/,
  )
  assert.match(hardening, /after update of character_class,level/)
})

test("Stage 6 NPC action execution is service-only, canonical and co-located", () => {
  assert.match(execution, /execute_ai_gm_npc_action_v2/)
  assert.match(execution, /auth\.role\(\) <> 'service_role'/)
  assert.match(execution, /npc_runtime_not_ready/)
  assert.match(execution, /npc_action_requires_same_location/)
  assert.match(execution, /character_template_selected_action_definition_v1/)
  assert.match(execution, /npc_runtime_mechanic_not_found/)
  assert.match(execution, /npc_action_target_not_present/)
  assert.match(execution, /npc_save_action_stage6_target_must_be_pc/)
})

test("Stage 6 NPC rolls use the canonical character sheet and same-location guard", () => {
  assert.match(execution, /execute_ai_gm_npc_roll_v2/)
  assert.match(execution, /npc_roll_requires_same_location/)
  assert.match(base, /from public\.character_sheets/)
  assert.match(base, /v_modifier := floor/)
  assert.match(base, /saving_throw_proficiencies/)
  assert.match(base, /skill_proficiencies/)
  assert.match(base, /send_chat_roll_v4/)
})

test("Stage 6 NPC save action and Stage 5 player wait are atomic", () => {
  assert.match(atomicSave, /execute_ai_gm_npc_action_turn_v1/)
  assert.match(atomicSave, /execute_ai_gm_npc_action_v2/)
  assert.match(atomicSave, /create_ai_gm_player_roll_request_v1/)
  assert.match(atomicSave, /'waiting_for_user',true/)
  assert.match(atomicSave, /'last_npc_action'/)
})

test("GM context exposes canonical NPC runtime only for present NPCs", () => {
  assert.match(context, /npcRuntime: JsonRecord\[\]/)
  assert.match(context, /read_ai_gm_npc_runtime_v1/)
  assert.match(context, /canonical_npc_runtime: context\.npcRuntime/)
})

test("GM Stage 6 can choose canonical NPC action or NPC roll without numeric mechanics", () => {
  assert.match(runtime, /\| "npc_action"/)
  assert.match(runtime, /\| "npc_roll"/)
  assert.match(runtime, /execute_ai_gm_npc_action_turn_v1/)
  assert.match(runtime, /execute_ai_gm_npc_roll_v2/)
  assert.match(runtime, /Никогда не передавай бонус атаки, урон, DC, кости или стоимость ресурса/)
  assert.match(runtime, /actionRuntime\?\.status === "ready"/)
})

test("GM Stage 6 blocks duplicate NPC action after a player-save resume", () => {
  assert.match(runtime, /last_npc_action_mechanic_id/)
  assert.match(runtime, /duplicate_npc_action_after_roll_resume_blocked/)
})

test("Stage 6 AI GM NPC events bypass manual actor binding only inside server runtime", () => {
  assert.match(
    chatIdentity,
    /set_config\('meganot\.ai_gm_runtime','on',true\)/,
  )
  assert.match(
    chatIdentity,
    /if current_setting\('meganot\.ai_gm_runtime', true\) = 'on' then/,
  )
  assert.match(
    chatIdentity,
    /v_runtime_user_id := coalesce\(new\.user_id, auth\.uid\(\)\)/,
  )
  assert.match(chatIdentity, /c\.character_type = 'npc'/)
  assert.match(chatIdentity, /c\.publication_state = 'campaign'/)
  assert.match(chatIdentity, /if auth\.uid\(\) is null then/)
})
