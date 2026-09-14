import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Voss stage 5 exposes draft read and revise tools", () => {
  const tools = read("supabase/functions/voss-agent/draft-tools.ts")

  assert.match(tools, /name: "read_content_draft"/)
  assert.match(tools, /name: "revise_content_draft"/)
  assert.match(tools, /expected_revision/)
  assert.match(tools, /nodes_upsert/)
  assert.match(tools, /node_keys_remove/)
  assert.match(tools, /relations_add/)
  assert.match(tools, /relations_remove/)
})

test("draft revision editing remains isolated from canonical engines", () => {
  const tools = read("supabase/functions/voss-agent/draft-tools.ts")

  assert.doesNotMatch(tools, /oracle\./)
  assert.doesNotMatch(tools, /gena\./)
  assert.doesNotMatch(tools, /\.from\("characters"\)/)
  assert.doesNotMatch(tools, /\.from\("locations"\)/)
  assert.doesNotMatch(tools, /\.from\("reference_definitions"\)/)
  assert.doesNotMatch(tools, /\.from\("character_inventory_items"\)/)
  assert.match(tools, /canonical_state_changed: false/)
})

test("revision flow uses optimistic locking and immutable history", () => {
  const tools = read("supabase/functions/voss-agent/draft-tools.ts")

  assert.match(tools, /draft_revision_conflict/)
  assert.match(tools, /current_revision/)
  assert.match(tools, /expectedRevision \+ 1/)
  assert.match(tools, /\.from\("ai_draft_revisions"\)/)
  assert.match(tools, /\.eq\("current_revision", expectedRevision\)/)
})

test("node removal also drops dangling relations before validation", () => {
  const tools = read("supabase/functions/voss-agent/draft-tools.ts")

  assert.match(tools, /removeKeys\.has\(relation\.from_key\)/)
  assert.match(tools, /removeKeys\.has\(relation\.to_key\)/)
  assert.match(tools, /validateDraft\(nextArgs\)/)
})

test("revision metadata is persisted and visible in UI", () => {
  const migration = read(
    "supabase/migrations/20260914164528_ai_draft_revision_editing_stage5.sql",
  )
  const provider = read("src/ai/AIProvider.tsx")
  const workshop = read("src/ui-v1-isolated/GMWorkshopDraft.tsx")
  const dock = read("src/ai/VossDock.tsx")

  assert.match(migration, /change_summary/)
  assert.match(migration, /operations jsonb/)
  assert.match(provider, /recent_revisions/)
  assert.match(workshop, /История ревизий/)
  assert.match(dock, /change_summary/)
})

test("Voss prompt requires reading the latest revision before editing", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /сначала используй read_content_draft/)
  assert.match(edge, /revise_content_draft/)
  assert.match(edge, /draft_revision_conflict/)
  assert.match(edge, /Не создавай новый AI-черновик/)
})
