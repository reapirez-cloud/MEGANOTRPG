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

test("players are forced to the base model at the Edge Function boundary", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")
  const router = read("supabase/functions/voss-agent/model-router.ts")

  assert.match(edge, /membership\.role === "gm" \|\| membership\.is_owner === true/)
  assert.match(edge, /resolveVossModel/)
  assert.match(router, /if \(!input\.canManage\)/)
  assert.match(router, /model: base/)
  assert.match(router, /routeMode: "base_lock"/)
  assert.match(router, /gm_selectable/)
})

test("GM Workshop registers semantic screen context for Voss", () => {
  const workshop = read("src/ui-v1-isolated/GMWorkshop.tsx")

  assert.match(workshop, /useAIViewContextLayer/)
  assert.match(workshop, /screen: "gm-workshop"/)
  assert.match(workshop, /facts:\s*\{/)
  assert.match(workshop, /\bvisible,\s*\n/)
})
