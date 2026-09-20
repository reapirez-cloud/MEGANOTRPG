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

test("image profiles map semantic cost and quality onto CheapVibeCode GPT Image 2", () => {
  const profiles = read("supabase/functions/voss-agent/image-profiles.ts")
  const tools = read("supabase/functions/voss-agent/image-tools.ts")

  assert.match(profiles, /tiny_icon[\s\S]*?quality: "low"/)
  assert.match(profiles, /ui_preview[\s\S]*?quality: "high"/)
  assert.match(profiles, /portrait[\s\S]*?quality: "high"/)
  assert.match(profiles, /panel[\s\S]*?quality: "high"/)
  assert.match(profiles, /hero_art[\s\S]*?quality: "high"/)
  assert.match(profiles, /master_art[\s\S]*?quality: "high"/)
  assert.match(profiles, /model: "gpt-image-2"/)
  assert.doesNotMatch(profiles, /gpt-image-2\.5-/)
  assert.doesNotMatch(profiles, /quality: "xhigh"|quality: "max"/)
  assert.match(tools, /Semantic purpose/)
  assert.doesNotMatch(tools, /name: "quality"/)
})

test("two requested images remain two provider outputs and two user-visible variants", () => {
  const provider = read("supabase/functions/voss-agent/image-provider.ts")
  const tools = read("supabase/functions/voss-agent/image-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")
  const shell = read("src/ai/AgentShell.tsx")
  const contract = read(
    "supabase/migrations/20260914234500_cheapvibecode_image_contract.sql",
  )

  assert.match(provider, /Math\.max\(1, Math\.min\(2/)
  assert.match(provider, /n: count/)
  assert.match(provider, /response_format: "b64_json"/)
  assert.doesNotMatch(provider, /output_compression|background: "auto"/)
  assert.match(tools, /enum: \[1, 2\]/)
  assert.match(tools, /variants === 2/)
  assert.match(tools, /Present both final outputs/)
  assert.match(tools, /while \(outputs\.length < requested && attempts < 3\)/)
  assert.match(tools, /missing = requested - outputs\.length/)
  assert.match(tools, /outputs\.length < requested/)
  assert.match(tools, /presentation_rule: "show_all_requested_outputs"/)
  assert.match(edge, /лимита: 1 или 2/)
  assert.match(edge, /интерфейс показывает оба результата/)
  assert.match(contract, /requested_outputs between 1 and 2/)
  assert.match(contract, /variant_index between 1 and 2/)
  assert.match(shell, /job\.outputs\.map\(\(asset\) =>/)
  assert.doesNotMatch(shell, /job\.outputs\.filter\([^)]*preferred/)
  assert.match(shell, /data-count=\{job\.outputs\.length\}/)
})

test("CheapVibeCode can use one shared API key and base URL for chat and images", () => {
  const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")
  const imageProvider = read("supabase/functions/voss-agent/image-provider.ts")

  assert.match(gateway, /"DEEPSEEK_API_KEY"[\s\S]*"AI_API_KEY"/)
  assert.match(gateway, /getEnv\("DEEPSEEK_API_BASE_URL", "AI_API_BASE_URL"\)/)
  assert.match(imageProvider, /"OPENAI_IMAGE_API_KEY", "OPENAI_API_KEY", "AI_API_KEY"/)
  assert.match(imageProvider, /getEnv\("OPENAI_IMAGE_API_BASE_URL", "AI_API_BASE_URL"\)/)
})

test("CheapVibeCode image storage detects the real returned binary format", () => {
  const tools = read("supabase/functions/voss-agent/image-tools.ts")

  assert.match(tools, /detectImageEncoding/)
  assert.match(tools, /image\/png/)
  assert.match(tools, /image\/jpeg/)
  assert.match(tools, /image\/webp/)
  assert.match(tools, /contentType: encoding\.mimeType/)
  assert.match(tools, /mime_type: encoding\.mimeType/)
  assert.doesNotMatch(tools, /assetId \+ "\/image\.webp"/)
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

test("CheapVibeCode image model stays hidden from the ordinary campaign model selector", () => {
  const migration = read(
    "supabase/migrations/20260914235500_cheapvibecode_image_registry.sql",
  )
  const stage9 = read(
    "supabase/migrations/20260914182800_ai_agent_security_provider_foundation_stage9.sql",
  )

  assert.match(migration, /'cheapvibecode-image'/)
  assert.match(migration, /'gpt-image-2'/)
  assert.match(migration, /'image'/)
  assert.match(migration, /gm_selectable[\s\S]*false/)
  assert.match(migration, /gpt-image-2\.5-flare/)
  assert.match(migration, /gpt-image-2\.5-sunburst/)
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
  assert.match(provider, /4000/)
  assert.match(provider, /outputs: \(assetsByJob\.get\(job\.id\) \|\| \[\]\)/)
})

test("review and attach are journaled as agent job types", () => {
  const tools = read("supabase/functions/voss-agent/image-tools.ts")

  assert.match(tools, /job_type: "image_review"/)
  assert.match(tools, /job_type: "image_attach"/)
  assert.match(tools, /status: "running"/)
  assert.match(tools, /status: "completed"/)
})


test("explicit one-image requests cannot silently degrade to text-only replies", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")
  const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")

  assert.match(edge, /isExplicitImageGenerationRequest/)
  assert.match(
    edge,
    /imageGenerationRequested[\s\S]*!imageToolsUsed\.includes\("generate_image"\)/,
  )
  assert.match(
    edge,
    /toolsForRound\.some\(\(tool\) => tool\.function\.name === "generate_image"\)/,
  )
  assert.match(edge, /function: \{ name: "generate_image" \}/)
  assert.match(edge, /Для одной картинки variants=1/)
  assert.match(gateway, /toolChoice\?: "auto" \| Record<string, unknown>/)
  assert.match(gateway, /tool_choice: input\.toolChoice \|\| "auto"/)
})
