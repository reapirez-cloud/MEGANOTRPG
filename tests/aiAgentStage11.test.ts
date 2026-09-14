import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 11 creates the unified agent job and generated-media schema", () => {
  const migration = read(
    "supabase/migrations/20260914190600_agent_jobs_and_generated_media_stage11.sql",
  )

  assert.match(migration, /create table if not exists public\.agent_jobs/)
  assert.match(migration, /create table if not exists public\.media_assets/)
  assert.match(migration, /create table if not exists public\.media_bindings/)
  assert.match(migration, /'image_generate','image_review','image_attach'/)
  assert.match(migration, /requested_outputs between 1 and 3/)
  assert.match(migration, /alter table public\.agent_jobs enable row level security/)
  assert.match(migration, /alter table public\.media_assets enable row level security/)
  assert.match(migration, /alter table public\.media_bindings enable row level security/)
})

test("player image quota counts outputs while GM and owner remain app-unlimited", () => {
  const migration = read(
    "supabase/migrations/20260914190600_agent_jobs_and_generated_media_stage11.sql",
  )

  assert.match(migration, /v_role <> 'gm'/)
  assert.match(migration, /coalesce\(v_is_owner, false\) = false/)
  assert.match(migration, /sum\(j\.requested_outputs\)/)
  assert.match(migration, /v_used \+ p_requested_outputs > 10/)
  assert.match(migration, /player_image_quota_exceeded/)
  assert.match(migration, /pg_advisory_xact_lock/)
})

test("image profiles choose semantic cost and quality instead of exposing raw controls", () => {
  const profiles = read("supabase/functions/voss-agent/image-profiles.ts")
  const tools = read("supabase/functions/voss-agent/image-tools.ts")

  assert.match(profiles, /tiny_icon[\s\S]*?quality: "low"/)
  assert.match(profiles, /ui_preview[\s\S]*?quality: "medium"/)
  assert.match(profiles, /portrait[\s\S]*?quality: "high"/)
  assert.match(profiles, /hero_art[\s\S]*?quality: "high"/)
  assert.match(profiles, /master_art[\s\S]*?quality: "xhigh"/)
  assert.match(profiles, /gpt-image-2\.5-flare/)
  assert.match(profiles, /gpt-image-2\.5-sunburst/)
  assert.match(tools, /Semantic purpose/)
  assert.doesNotMatch(tools, /name: "quality"/)
})

test("three requested images remain three provider outputs and three user-visible variants", () => {
  const provider = read("supabase/functions/voss-agent/image-provider.ts")
  const tools = read("supabase/functions/voss-agent/image-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(provider, /n: input\.count/)
  assert.match(tools, /enum: \[1, 2, 3\]/)
  assert.match(tools, /variants === 3/)
  assert.match(tools, /All three final outputs must be presented/)
  assert.match(tools, /while \(outputs\.length < requested && attempts < 3\)/)
  assert.match(tools, /missing = requested - outputs\.length/)
  assert.match(tools, /outputs\.length < requested/)
  assert.match(tools, /presentation_rule: "show_all_requested_outputs"/)
  assert.match(edge, /Если пользователь попросил 3 картинки, variants ОБЯЗАН быть 3/)
  assert.match(edge, /интерфейс показывает все 3/)
  assert.match(shell, /job\.outputs\.map\(\(asset\) =>/)
  assert.doesNotMatch(shell, /job\.outputs\.filter\([^)]*preferred/)
  assert.match(shell, /Показаны все запрошенные варианты/)
})

test("vision review ranks alternatives but cannot suppress them", () => {
  const tools = read("supabase/functions/voss-agent/image-tools.ts")

  assert.match(tools, /preferred_variant/)
  assert.match(tools, /ranking must contain every supplied variant exactly once/)
  assert.match(tools, /Every requested output remains user-visible/)
  assert.match(tools, /completeRanking/)
  assert.match(tools, /preferred:/)
  assert.match(tools, /presentation_rule: "show_all_requested_outputs"/)
})

test("generation and attachment remain separate permission-gated operations", () => {
  const migration = read(
    "supabase/migrations/20260914190600_agent_jobs_and_generated_media_stage11.sql",
  )
  const tools = read("supabase/functions/voss-agent/image-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(tools, /name: "generate_image"/)
  assert.match(tools, /name: "attach_generated_image"/)
  assert.match(tools, /attachWhenReady[\s\S]*?variants === 1/)
  assert.match(migration, /private\.can_attach_media_target/)
  assert.match(migration, /private\.can_manage_character/)
  assert.match(migration, /c\.assigned_user_id = p_user_id/)
  assert.match(migration, /private\.can_manage_location/)
  assert.match(edge, /Генерация изображения и прикрепление к сущности — разные действия/)
  assert.match(edge, /Если вариантов больше одного, никогда не выбирай и не прикрепляй вариант сам/)
})

test("generated files inherit target visibility only through media bindings", () => {
  const migration = read(
    "supabase/migrations/20260914190600_agent_jobs_and_generated_media_stage11.sql",
  )

  assert.match(migration, /private\.can_read_media_asset/)
  assert.match(migration, /v_asset\.created_by = p_user_id/)
  assert.match(migration, /private\.can_view_character/)
  assert.match(migration, /private\.can_view_location/)
  assert.match(migration, /v_parts\[3\] = 'ai-assets'/)
  assert.match(migration, /private\.can_read_media_asset\(v_asset_id, auth\.uid\(\)\)/)
})

test("generated garbage is marked first and purged only after three days", () => {
  const migration = read(
    "supabase/migrations/20260914190600_agent_jobs_and_generated_media_stage11.sql",
  )
  const tools = read("supabase/functions/voss-agent/image-tools.ts")

  assert.match(migration, /garbage_marked_at = now\(\)/)
  assert.match(migration, /attached_media_cannot_be_garbage/)
  assert.match(tools, /3 \* 24 \* 60 \* 60 \* 1000/)
  assert.match(tools, /purge_after_days: 3/)
  assert.match(tools, /\.storage[\s\S]*?\.remove\(/)
})

test("image models stay hidden from the ordinary campaign model selector", () => {
  const migration = read(
    "supabase/migrations/20260914190600_agent_jobs_and_generated_media_stage11.sql",
  )
  const stage9 = read(
    "supabase/migrations/20260914182800_ai_agent_security_provider_foundation_stage9.sql",
  )

  assert.match(migration, /model_kind[\s\S]*?'image'/)
  assert.match(migration, /gm_selectable[\s\S]*?false/)
  assert.match(stage9, /model_kind = 'agent'/)
  assert.match(stage9, /access_scope = 'campaign'/)
})

test("Agent UI polls active image jobs and resolves private media through signed URLs", () => {
  const provider = read("src/ai/AIProvider.tsx")

  assert.match(provider, /from\("agent_jobs"\)/)
  assert.match(provider, /from\("media_assets"\)/)
  assert.match(provider, /resolveCampaignMediaUrl/)
  assert.match(provider, /hasActiveJobs/)
  assert.match(provider, /window\.setInterval/)
  assert.match(provider, /2200/)
  assert.match(provider, /outputs: \(assetsByJob\.get\(job\.id\) \|\| \[\]\)/)
})

test("review and attach are journaled as agent job types", () => {
  const tools = read("supabase/functions/voss-agent/image-tools.ts")

  assert.match(tools, /job_type: "image_review"/)
  assert.match(tools, /job_type: "image_attach"/)
  assert.match(tools, /status: "running"/)
  assert.match(tools, /status: "completed"/)
})
