import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260924180941_ai_world_evolution_stage23_adult_life_sim_content_profile_v1.sql",
)
const privilegeHardening = read(
  "supabase/migrations/20260924181456_ai_world_evolution_stage23_content_privilege_hardening_v2.sql",
)
const fkIndex = read(
  "supabase/migrations/20260924181711_ai_world_evolution_stage23_content_fk_index_v3.sql",
)
const modeSemantics = read(
  "supabase/migrations/20260925113000_ai_gm_immersive_presentation_and_mode_semantics_v1.sql",
)
const permissionOnly = read(
  "supabase/migrations/20260925113500_ai_gm_adult_profile_permission_only_v1.sql",
)
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const shell = read("src/ai/AgentShell.tsx")
const css = read("src/ai/ai-voss.css")
const contract = read("src/ai-world-evolution/contract.ts")
const roadmap = read("docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md")

test("Stage 23 stores one AI-world campaign content mode with safe default", () => {
  assert.match(migration, /ai_gm_content_settings/)
  assert.match(migration, /default 'off'/)
  assert.match(migration, /'off','allowed','adult_focused'/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /ensure_ai_gm_content_setting_for_slot_v1/)
  assert.match(migration, /values\(new\.campaign_id,'off',null::uuid\)/)
})

test("Stage 23 selector is member-readable and manager-writable through invoker RPCs", () => {
  assert.match(migration, /ai_gm_content_settings_read_member/)
  assert.match(migration, /private\.is_campaign_member/)
  assert.match(migration, /ai_gm_content_settings_(?:insert|update)_manager/)
  assert.match(migration, /private\.is_campaign_manager/)
  assert.match(migration, /private\.is_ai_world_campaign_v1/)
  assert.match(migration, /permanent_account_required/)
  assert.match(migration, /list_campaign_ai_gm_content_profiles_v1/)
  assert.match(migration, /set_campaign_ai_gm_content_profile_v1/)
  assert.equal((migration.match(/security invoker/g) || []).length, 2)
  assert.doesNotMatch(
    migration,
    /grant delete[^\n]*ai_gm_content_settings/i,
  )
})

test("Stage 23 closes table privilege and FK advisor debt", () => {
  assert.match(
    privilegeHardening,
    /revoke all on table public\.ai_gm_content_settings from service_role/,
  )
  assert.match(
    privilegeHardening,
    /grant select, insert, update on table public\.ai_gm_content_settings to service_role/,
  )
  assert.doesNotMatch(privilegeHardening, /grant[^\n]*(?:delete|truncate)/i)
  assert.match(fkIndex, /ai_gm_content_settings_updated_by_idx/)
  assert.match(fkIndex, /where updated_by is not null/)
})

test("Stage 23 is narrative-only and stays out of generic world-worker context", () => {
  assert.match(context, /contentProfile: JsonRecord/)
  assert.match(context, /from\("ai_gm_content_settings"\)/)
  assert.match(runtime, /content_profile: context\.contentProfile/)
  assert.match(context, /content_profile: context\.contentProfile/)

  const stage2Start = context.indexOf("export function stage2ContextForPrompt")
  const stage2End = context.indexOf("export function stage19ContextTelemetry")
  const genericPrompt = context.slice(stage2Start, stage2End)
  assert.doesNotMatch(genericPrompt, /contentProfile|content_profile/)

  const background = read("supabase/functions/voss-agent/background-world.ts")
  assert.doesNotMatch(background, /contentProfile|content_profile/)
})

test("Stage 23 keeps adult profile permission-only inside the GM prompt", () => {
  const gmStart = runtime.indexOf("const STAGE12_GAME_MASTER_SYSTEM")
  const npcStart = runtime.indexOf("const NPC_DIALOGUE_SYSTEM", gmStart)
  const gmPrompt = runtime.slice(gmStart, npcStart)

  assert.match(gmPrompt, /content_profile\.mode=allowed: разрешены зрелые темы/)
  assert.match(gmPrompt, /content_profile\.mode=adult_focused: всё из allowed разрешено/)
  assert.doesNotMatch(
    gmPrompt,
    /несовершеннолет|совершеннолет|provider|policy|jailbreak|цензур|consent|compliance|fade-to-black/i,
  )
})

test("Stage 23 NPC prompt stays permission-oriented", () => {
  const npcStart = runtime.indexOf("const NPC_DIALOGUE_SYSTEM")
  const jsonStart = runtime.indexOf("function jsonRecord", npcStart)
  const npcPrompt = runtime.slice(npcStart, jsonStart)

  assert.match(npcPrompt, /allowed\/adult_focused разрешают зрелые темы/)
  assert.doesNotMatch(
    npcPrompt,
    /несовершеннолет|совершеннолет|provider|policy|jailbreak|цензур|consent|compliance|fade-to-black/i,
  )
})

test("Stage 23 records bounded telemetry on AI GM jobs", () => {
  assert.match(context, /stage23ContentProfileTelemetry/)
  assert.match(context, /stage23_content_mode/)
  assert.match(context, /stage23_content_enabled/)
  assert.match(context, /stage23_content_permissions/)
  assert.doesNotMatch(context, /stage23_provider_boundary/)
  assert.match(runtime, /stage23ContentProfileTelemetry/)
})

test("Stage 23 current profile summaries are permission-only", () => {
  assert.match(permissionOnly, /Взрослая тематика не является специальным приоритетом/)
  assert.match(permissionOnly, /Разрешает зрелые темы и взрослые ситуации/)
  assert.match(permissionOnly, /mature_themes_allowed/)
  assert.match(permissionOnly, /adult_focus/)
  assert.doesNotMatch(
    permissionOnly,
    /несовершеннолет|совершеннолет|provider|policy|jailbreak|цензур|consent|fade-to-black/i,
  )
})

test("Stage 23 UI exposes all three modes but only managers can mutate them", () => {
  assert.match(shell, /list_campaign_ai_gm_content_profiles_v1/)
  assert.match(shell, /set_campaign_ai_gm_content_profile_v1/)
  assert.match(shell, /"off" \| "allowed" \| "adult_focused"/)
  assert.match(shell, /Взрослая тематика/)
  assert.match(shell, /!canManage/)
  assert.match(css, /\.u1-agent-content-profile-list/)
  assert.match(css, /\.u1-agent-content-profile-choice/)
})

test("Stage 23 is implemented in the executable contract and master roadmap", () => {
  const stage23Start = contract.indexOf("id: 23,")
  const stage24Start = contract.indexOf("id: 24,")
  const stage23 = contract.slice(stage23Start, stage24Start)
  assert.match(stage23, /status: "implemented"/)
  assert.match(stage23, /provider remains authoritative/i)
  assert.match(stage23, /never converts player desire into NPC consent/i)
  assert.match(roadmap, /## Stage 23 — Adult \/ life-simulation content profile/)
  assert.match(roadmap, /\*\*Status: IMPLEMENTED — 2026-09-24\*\*/)
})
