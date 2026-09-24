import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260924180500_ai_world_evolution_stage22_player_director_preferences_v1.sql",
)
const context = read("supabase/functions/voss-agent/game-chat-context.ts")
const runtime = read("supabase/functions/voss-agent/game-chat-runtime.ts")
const shell = read("src/ai/AgentShell.tsx")
const css = read("src/ai/ai-voss.css")
const contract = read("src/ai-world-evolution/contract.ts")
const roadmap = read("docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md")

test("Stage 22 stores bounded per-player versioned preferences", () => {
  assert.match(migration, /ai_player_director_preferences/)
  assert.match(migration, /ai_player_director_preference_versions/)
  assert.match(migration, /version_ai_player_director_preference_v1/)
  assert.match(migration, /capture_ai_player_director_preference_version_v1/)
  assert.match(migration, /between 0 and 5/)
  assert.match(migration, /char_length\(free_text\) <= 1200/)
})

test("Stage 22 lets players mutate only their own AI-world preference row", () => {
  assert.match(migration, /user_id=\(select auth\.uid\(\)\)/)
  assert.match(migration, /private\.is_ai_world_campaign_v1/)
  assert.match(migration, /private\.is_campaign_member/)
  assert.match(migration, /security invoker/gi)
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete)[^\n]*ai_player_director_preference_versions/i,
  )
})

test("Stage 22 co-op merge is equal-weight and preserves disagreement range", () => {
  assert.match(migration, /equal_weight_mean_of_configured_participants/)
  assert.match(migration, /preserve_range_and_alternate_plausible_future_opportunities/)
  assert.match(migration, /'spread',max\(combat\)-min\(combat\)/)
  assert.match(migration, /limit 16/)
})

test("Stage 22 scene scoping uses physically present PCs only", () => {
  assert.match(context, /presentPcCharacterIds/)
  assert.match(context, /presentCharacters[\s\S]*character_type === "pc"/)
  assert.match(context, /participantCharacterByUser/)
  assert.match(context, /read_ai_gm_director_preferences_v1/)
  assert.match(context, /scope: "physical_scene_participants_only"/)
})

test("Stage 22 is injected only into primary GM guidance, not generic junior canon", () => {
  assert.match(runtime, /player_director_preferences: context\.directorPreferences/)
  assert.match(runtime, /БУДУЩИХ возможностях/i)
  assert.match(runtime, /не меняют уже существующий факт/i)
  assert.match(runtime, /НЕ означает симпатию конкретного NPC/i)
  assert.match(runtime, /НЕ выбирай молча одного победителя/i)

  const stage2PromptStart = context.indexOf("export function stage2ContextForPrompt")
  const stage2PromptEnd = context.indexOf("export function stage19ContextTelemetry")
  const stage2Prompt = context.slice(stage2PromptStart, stage2PromptEnd)
  assert.doesNotMatch(stage2Prompt, /directorPreferences/)
})

test("Stage 22 records bounded preference telemetry on GM jobs", () => {
  assert.match(context, /stage22DirectorPreferenceTelemetry/)
  assert.match(context, /stage22_director_participant_count/)
  assert.match(context, /stage22_director_configured_count/)
  assert.match(context, /stage22_director_version_vector/)
  assert.match(runtime, /stage22DirectorPreferenceTelemetry/)
})

test("Stage 22 player UI exposes structured interests plus bounded free text", () => {
  assert.match(shell, /AI_DIRECTOR_INTERESTS/)
  assert.match(shell, /read_my_ai_director_preferences_v1/)
  assert.match(shell, /set_my_ai_director_preferences_v1/)
  assert.match(shell, /type="range"/)
  assert.match(shell, /maxLength=\{1200\}/)
  assert.match(shell, /будущих возможностях/)
  assert.match(css, /\.u1-agent-director-list/)
  assert.match(css, /\.u1-agent-director-save/)
})

test("Stage 22 remains explicitly non-canonical in the executable contract and roadmap", () => {
  assert.match(contract, /key: "player-director-preferences"/)
  assert.match(contract, /never as commands that rewrite NPCs or canon/)
  assert.match(roadmap, /## Stage 22 — Player director preferences/)
})
