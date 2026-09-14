import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 13 keeps system admin authority separate from campaign roles", () => {
  const stage9 = read(
    "supabase/migrations/20260914182800_ai_agent_security_provider_foundation_stage9.sql",
  )
  const stage13 = read(
    "supabase/migrations/20260914204500_developer_mode_stage13.sql",
  )

  assert.match(stage9, /create table if not exists private\.system_admin_users/)
  assert.match(stage13, /private\.is_system_admin\(v_user_id\)/)
  assert.match(stage13, /system_admin_required/)
  assert.doesNotMatch(
    stage13,
    /insert into private\.system_admin_users[\s\S]*campaign_members/,
  )
})

test("Developer Mode sessions are short-lived, token-hashed and not directly writable", () => {
  const migration = read(
    "supabase/migrations/20260914204500_developer_mode_stage13.sql",
  )

  assert.match(migration, /create table if not exists public\.ai_dev_sessions/)
  assert.match(migration, /token_hash text not null/)
  assert.match(migration, /now\(\) \+ interval '30 minutes'/)
  assert.match(migration, /encode\(digest\(v_token,'sha256'\),'hex'\)/)
  assert.match(migration, /revoke all on public\.ai_dev_sessions from anon, authenticated/)
  assert.match(migration, /validate_ai_dev_session_v1/)
  assert.match(
    migration,
    /revoke all on function public\.validate_ai_dev_session_v1\(uuid,text,uuid\)\nfrom public, anon, authenticated;\ngrant execute on function public\.validate_ai_dev_session_v1\(uuid,text,uuid\)\nto service_role;/,
  )
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.validate_ai_dev_session_v1\(uuid,text,uuid\)\nto authenticated;/,
  )
})

test("owner override models are visible only to system admins and cannot become campaign selections", () => {
  const migration = read(
    "supabase/migrations/20260914204500_developer_mode_stage13.sql",
  )
  const stage9 = read(
    "supabase/migrations/20260914182800_ai_agent_security_provider_foundation_stage9.sql",
  )

  assert.match(
    migration,
    /model_kind = 'owner_override'[\s\S]*access_scope = 'system_admin'[\s\S]*private\.is_system_admin/,
  )
  assert.match(migration, /'Astra · Owner override'/)
  assert.match(migration, /'owner_override'[\s\S]*'system_admin'/)
  assert.match(migration, /'Astra · Owner override'[\s\S]*false/)
  assert.match(
    stage9,
    /can_select_campaign_ai_model[\s\S]*model_kind = 'agent'[\s\S]*access_scope = 'campaign'/,
  )
})

test("developer routing is explicit and owner override is never an automatic fallback", () => {
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.match(router, /\| "developer"/)
  assert.match(router, /developerMode/)
  assert.match(router, /isSystemAdmin/)
  assert.match(router, /developerOwnerOverrideModelId/)
  assert.match(router, /routeMode: "owner_override"/)
  assert.match(router, /manually selected the Developer Mode owner override/)
  assert.match(router, /Developer Mode uses the normal DeepSeek\/campaign agent/)
})

test("provider gateway requires an explicit server-side owner override allowance", () => {
  const provider = read("supabase/functions/voss-agent/provider-gateway.ts")

  assert.match(provider, /allowOwnerOverride\?: boolean/)
  assert.match(provider, /model\.model_kind === "owner_override"/)
  assert.match(provider, /model\.access_scope === "system_admin"/)
  assert.match(provider, /case "astra-compatible"/)
  assert.match(provider, /ASTRA_API_KEY/)
  assert.match(provider, /ASTRA_API_BASE_URL/)
  assert.match(provider, /owner_override_scope_denied/)
  assert.doesNotMatch(provider, /fallback.*astra/i)
})

test("model-side developer tools can read and propose but cannot approve or merge", () => {
  const tools = read("supabase/functions/voss-agent/developer-tools.ts")

  assert.match(tools, /name: "read_repo_file"/)
  assert.match(tools, /name: "list_repo_tree"/)
  assert.match(tools, /name: "search_repo_code"/)
  assert.match(tools, /name: "propose_dev_patch"/)
  assert.match(tools, /canonical_repository_changed: false/)
  assert.match(tools, /approval_required: true/)
  assert.doesNotMatch(tools, /name: "apply_dev_patch"/)
  assert.doesNotMatch(tools, /name: "merge_dev/)
  assert.doesNotMatch(tools, /name: "deploy_dev/)
})

test("developer patch path policy protects CI workflows and secret-like files", () => {
  const tools = read("supabase/functions/voss-agent/developer-tools.ts")

  assert.match(tools, /\.github\\\/workflows/)
  assert.match(tools, /\.env/)
  assert.match(tools, /secrets?/)
  assert.match(tools, /\.pem/)
  assert.match(tools, /\.key/)
  assert.match(tools, /BASE_BRANCH = "dev"/)
  assert.match(tools, /developer_path_protected/)
})

test("developer proposals are pinned to the exact dev SHA and become stale if dev moved", () => {
  const tools = read("supabase/functions/voss-agent/developer-tools.ts")
  const executor = read("supabase/functions/developer-mode/github-dev.ts")
  const edge = read("supabase/functions/developer-mode/index.ts")

  assert.match(tools, /const baseSha = await repoHead\(\)/)
  assert.match(tools, /base_sha: baseSha/)
  assert.match(executor, /const currentBase = await devHeadSha\(\)/)
  assert.match(executor, /currentBase !== run\.base_sha/)
  assert.match(executor, /developer_run_stale/)
  assert.match(edge, /state: "stale"/)
})

test("repository mutation is a direct authenticated UI action, not a model tool", () => {
  const edge = read("supabase/functions/developer-mode/index.ts")
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(edge, /validate_ai_dev_session_v1/)
  assert.match(edge, /action === "apply"/)
  assert.match(edge, /applyRunToPreviewBranch/)
  assert.match(shell, /Создать preview-ветку/)
  assert.match(shell, /window\.confirm/)
  assert.match(shell, /applyDevRun\(latestDevRun\.id\)/)
})

test("preview application creates an isolated branch and PR against dev only", () => {
  const executor = read("supabase/functions/developer-mode/github-dev.ts")

  assert.match(executor, /DEV_BASE_BRANCH = "dev"/)
  assert.match(executor, /"ai\/voss\/" \+ run\.id\.slice/)
  assert.match(executor, /"refs\/heads\/" \+ branch/)
  assert.match(executor, /"\/pulls"/)
  assert.match(executor, /base: DEV_BASE_BRANCH/)
  assert.match(executor, /Developer Mode has no main merge capability/)
})

test("CI and Vercel preview must both pass before merge to dev", () => {
  const edge = read("supabase/functions/developer-mode/index.ts")
  const executor = read("supabase/functions/developer-mode/github-dev.ts")

  assert.match(edge, /remote\.ciState === "success"/)
  assert.match(edge, /remote\.previewState === "success"/)
  assert.match(edge, /state = "merge_ready"/)
  assert.match(edge, /CI success \+ preview success are both mandatory/)
  assert.match(executor, /run\.state !== "merge_ready"/)
  assert.match(executor, /"\/pulls\/" \+ run\.pr_number \+ "\/merge"/)
  assert.match(edge, /target: "dev"/)
  assert.match(edge, /mainUntouched: true/)
})

test("Developer Mode journals patch, test, build, preview and dev deploy jobs", () => {
  const tools = read("supabase/functions/voss-agent/developer-tools.ts")
  const edge = read("supabase/functions/developer-mode/index.ts")

  assert.match(tools, /job_type: "dev_patch"/)
  assert.match(edge, /"dev_test"/)
  assert.match(edge, /"dev_build"/)
  assert.match(edge, /"dev_preview"/)
  assert.match(edge, /job_type: "dev_deploy"/)
  assert.match(edge, /target: "dev"/)
})

test("Voss receives developer tools only with an active system-admin session", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /is_system_admin_for_v1/)
  assert.match(edge, /validate_ai_dev_session_v1/)
  assert.match(edge, /developerMode = true/)
  assert.match(
    edge,
    /developerMode[\s\S]*isSystemAdmin[\s\S]*!mechanicsAuthoringRequested[\s\S]*VOSS_DEVELOPER_TOOLS/,
  )
  assert.match(edge, /devSessionId/)
  assert.match(edge, /devSessionToken/)
})

test("Developer Mode remains dev-only and does not restore mechanics authoring", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /Developer Mode нужен только для работ с приложением и инфраструктурой/)
  assert.match(edge, /не отменяет запрет Воссу проектировать или внедрять игровые механики/)
  assert.match(edge, /Developer Mode никогда не сливает в main/)
  assert.match(edge, /Owner override.*никогда не выбирается автоматически/)
})

test("browser keeps the raw dev session token in React memory, not localStorage", () => {
  const provider = read("src/ai/AIProvider.tsx")

  assert.match(provider, /const \[devSessionToken, setDevSessionToken\] = useState\(""/)
  assert.match(provider, /open_ai_dev_session_v1/)
  assert.match(provider, /devSessionToken/)
  assert.doesNotMatch(provider, /localStorage\.setItem\([^\n]*devSession/i)
  assert.doesNotMatch(provider, /sessionStorage\.setItem\([^\n]*devSession/i)
})

test("Agent UI exposes no main merge action", () => {
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(shell, /Слить в dev/)
  assert.match(shell, /main останется нетронут/)
  assert.doesNotMatch(shell, />\s*Слить в main\s*</)
  assert.doesNotMatch(shell, /merge.*main/i)
})
