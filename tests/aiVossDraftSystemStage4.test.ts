import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Voss keeps one AI-draft creation command while Workshop draft access is read-only", () => {
  const tools = read("supabase/functions/voss-agent/draft-tools.ts")

  assert.equal((tools.match(/name: "propose_content_draft"/g) || []).length, 1)
  assert.match(tools, /GM-only structured AI draft/)
  assert.match(tools, /name: "list_workshop_drafts"/)
  assert.match(tools, /name: "list_content_drafts"/)
  assert.doesNotMatch(tools, /oracle\./)
  assert.doesNotMatch(tools, /gena\./)
  assert.doesNotMatch(tools, /\.rpc\(/)
  assert.doesNotMatch(tools, /\.from\("characters"\)[\s\S]{0,500}?\.(?:insert|update|delete|upsert)\(/)
  assert.doesNotMatch(tools, /\.from\("reference_definitions"\)[\s\S]{0,500}?\.(?:insert|update|delete|upsert)\(/)
})

test("draft persistence is isolated to AI draft tables", () => {
  const tools = read("supabase/functions/voss-agent/draft-tools.ts")

  assert.match(tools, /\.from\("ai_drafts"\)/)
  assert.match(tools, /\.from\("ai_draft_revisions"\)/)
  assert.match(tools, /canonical_state_changed: false/)
  assert.match(tools, /canManage/)
})

test("draft schema is typed for future canonical execution", () => {
  const tools = read("supabase/functions/voss-agent/draft-tools.ts")

  assert.match(tools, /parent_location/)
  assert.match(tools, /location_transition/)
  assert.match(tools, /npc_habitat/)
  assert.match(tools, /inventory_owner/)
  assert.match(tools, /normalizePayload/)
  assert.match(tools, /visibility_mode/)
  assert.match(tools, /rules_text/)
  assert.match(tools, /class_template_id/)
})

test("players never receive the draft tool from the gateway", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /const canManage = membership\.role === "gm" \|\| membership\.is_owner === true/)
  assert.match(edge, /\.\.\.\(canManage[\s\S]*!mechanicsAuthoringRequested \? VOSS_DRAFT_TOOLS/)
  assert.match(edge, /executeVossDraftTool/)
  assert.match(edge, /isVossDraftTool/)
})

test("AI draft tables are manager-readable and client read-only", () => {
  const migration = read(
    "supabase/migrations/20260914162511_ai_draft_system_stage4.sql",
  )

  assert.match(migration, /private\.is_campaign_manager/)
  assert.match(migration, /grant select on public\.ai_drafts to authenticated/)
  assert.match(migration, /grant select on public\.ai_draft_revisions to authenticated/)
  assert.doesNotMatch(migration, /grant insert on public\.ai_drafts to authenticated/i)
  assert.doesNotMatch(migration, /grant update on public\.ai_drafts to authenticated/i)
})

test("structured AI drafts live in Workshop instead of being injected into every chat", () => {
  const workshop = read("src/ui-v1-isolated/GMWorkshopDraft.tsx")
  const shell = read("src/ai/AgentShell.tsx")
  const provider = read("src/ai/AIProvider.tsx")

  assert.match(workshop, /Черновики Восса/)
  assert.match(workshop, /AI DRAFT · НЕ КАНОН/)
  assert.doesNotMatch(shell, /AI DRAFT · НЕ КАНОН/)
  assert.doesNotMatch(shell, /drafts\[0\]/)
  assert.match(provider, /from\("ai_drafts"\)/)
  assert.match(provider, /refreshDrafts/)
})
