import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Voss AI foundation keeps provider secrets server-side", () => {
  const provider = read("src/ai/AIProvider.tsx")
  const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")

  assert.match(provider, /supabase\.functions\.invoke\("voss-agent"/)
  assert.doesNotMatch(provider, /DEEPSEEK_API_KEY/)
  assert.doesNotMatch(provider, /AI_API_KEY/)
  assert.match(gateway, /DEEPSEEK_API_KEY/)
  assert.match(gateway, /AI_API_KEY/)
  assert.match(gateway, /AI_API_BASE_URL/)
  assert.match(gateway, /AI_DEFAULT_MODEL/)
})

test("players can select public campaign models without gaining GM authority", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")
  const router = read("supabase/functions/voss-agent/model-router.ts")
  const migration = read(
    "supabase/migrations/20260915004500_voss_grok_user_models_attachments.sql",
  )

  assert.match(edge, /const authority = resolveVossAuthority\(membership \|\| \{\}, isSystemAdmin\)/)
  assert.match(edge, /const canManage = canManageCampaignWithVoss\(authority\)/)
  assert.match(edge, /ai_user_agent_settings/)
  assert.match(router, /user_selectable/)
  assert.match(router, /Player uses their explicitly selected public campaign model/)
  assert.match(router, /routeMode: "primary"/)
  assert.match(migration, /'grok-4\.6'/)
  assert.match(migration, /user_selectable = true/)
  assert.match(migration, /ai_user_agent_settings/)
})

test("GM Workshop registers semantic screen context for Voss", () => {
  const workshop = read("src/ui-v1-isolated/GMWorkshop.tsx")

  assert.match(workshop, /useAIViewContextLayer/)
  assert.match(workshop, /screen: "gm-workshop"/)
  assert.match(workshop, /facts:\s*\{/)
  assert.match(workshop, /\bvisible,\s*\n/)
})
