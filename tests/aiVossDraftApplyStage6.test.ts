import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 6 applies canonical mutations only through Oracle", () => {
  const apply = read("src/ai/applyDraft.ts")

  assert.match(apply, /engineRuntime\.oracle\.world\.createLocation/)
  assert.match(apply, /engineRuntime\.oracle\.characters\.create/)
  assert.match(apply, /engineRuntime\.oracle\.definitions\.create/)
  assert.match(apply, /engineRuntime\.oracle\.inventory\.create/)
  assert.match(apply, /engineRuntime\.oracle\.world\.setNpcHabitat/)
  assert.match(apply, /engineRuntime\.oracle\.world\.createLocationLink/)

  assert.doesNotMatch(apply, /\.from\("locations"\)\.insert/)
  assert.doesNotMatch(apply, /\.from\("characters"\)\.insert/)
  assert.doesNotMatch(apply, /\.from\("reference_definitions"\)\.insert/)
  assert.doesNotMatch(apply, /\.from\("character_inventory_items"\)\.insert/)
})

test("Stage 6 locks an exact draft revision before the first mutation", () => {
  const apply = read("src/ai/applyDraft.ts")
  const migration = read(
    "supabase/migrations/20260914165931_ai_draft_apply_stage6.sql",
  )

  assert.match(apply, /begin_ai_draft_apply_v1/)
  assert.match(apply, /p_expected_revision: draft\.current_revision/)
  assert.match(migration, /for update/)
  assert.match(migration, /v_draft\.current_revision <> p_expected_revision/)
  assert.match(migration, /ai_draft_apply_runs_one_per_revision_idx/)
})

test("Stage 6 records each successful apply step and canonical id", () => {
  const apply = read("src/ai/applyDraft.ts")
  const migration = read(
    "supabase/migrations/20260914165931_ai_draft_apply_stage6.sql",
  )

  assert.match(apply, /record_ai_draft_apply_step_v1/)
  assert.match(migration, /completed_steps/)
  assert.match(migration, /entity_map/)
  assert.match(migration, /jsonb_set/)
})

test("failed apply runs are explicit about partial canonical creation", () => {
  const apply = read("src/ai/applyDraft.ts")
  const migration = read(
    "supabase/migrations/20260914170507_ai_draft_apply_retry_safety_stage6.sql",
  )

  assert.match(migration, /partial_failed/)
  assert.match(migration, /p_partial_hint/)
  assert.match(migration, /jsonb_array_length\(v_run\.completed_steps\) > 0/)
  assert.match(apply, /partial: completed > 0/)
  assert.match(apply, /finish_ai_draft_apply_v2/)
  assert.doesNotMatch(apply, /oracle\.[\s\S]*rollback/i)
})

test("successful apply marks the exact reviewed draft as applied", () => {
  const migration = read(
    "supabase/migrations/20260914170507_ai_draft_apply_retry_safety_stage6.sql",
  )
  const base = read(
    "supabase/migrations/20260914165931_ai_draft_apply_stage6.sql",
  )

  assert.match(migration, /status = 'applied'/)
  assert.match(migration, /status = 'review'/)
  assert.match(migration, /current_revision = v_run\.draft_revision/)
  assert.match(base, /applied_at/)
  assert.match(base, /applied_by/)
})

test("AI model still has no tool that can approve or apply a draft", () => {
  const draftTools = read("supabase/functions/voss-agent/draft-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.doesNotMatch(draftTools, /apply_content_draft/)
  assert.doesNotMatch(draftTools, /approve_content_draft/)
  assert.doesNotMatch(edge, /apply_content_draft/)
  assert.doesNotMatch(edge, /approve_content_draft/)
})

test("GM Workshop requires an explicit confirmation before apply", () => {
  const workshop = read("src/ui-v1-isolated/GMWorkshopReview.tsx")

  assert.match(workshop, /approveAIDraft/)
  assert.match(workshop, /kind: "confirm"/)
  assert.match(workshop, /Утвердить и создать/)
  assert.match(workshop, /applyAIDraft/)
})

test("apply receipts must match the immutable plan before success", () => {
  const hardening = read(
    "supabase/migrations/20260914170359_ai_draft_apply_hardening_stage6.sql",
  )
  const retry = read(
    "supabase/migrations/20260914170507_ai_draft_apply_retry_safety_stage6.sql",
  )

  assert.match(hardening, /ai_draft_step_not_planned/)
  assert.match(hardening, /ai_draft_step_already_recorded/)
  assert.match(hardening, /ai_draft_apply_incomplete/)
  assert.match(retry, /where status in \('running','succeeded','partial_failed'\)/)
})
