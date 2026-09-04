import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const closure = fs.readFileSync(
  "supabase/migrations/20260904090000_wizard_runtime_closure_v1.sql",
  "utf8",
)

function section(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  assert.ok(from >= 0, `missing section ${start}`)
  const to = source.indexOf(end, from + start.length)
  return source.slice(from, to >= 0 ? to : undefined)
}

test("final Wizard runtime closure restores authoritative base metadata after subclass v3", () => {
  const apply = section(
    closure,
    "create or replace function private.apply_wizard_runtime_closure_v1",
    "revoke all on function private.apply_wizard_runtime_closure_v1",
  )

  assert.match(apply, /perform private\.apply_wizard_base_closure\(p_campaign_id\)/)
  assert.match(apply, /'mechanics_status','READY'/)
  assert.match(apply, /'subclasses_included',true/)
  assert.match(apply, /'subclass_supported_count',13/)
  assert.match(apply, /'subclass_mechanics_status','READY'/)
  assert.match(apply, /'subclass_runtime_revision','wizard-subclasses-runtime@3'/)
  assert.match(apply, /'runtime_closure_revision','wizard-runtime-closure@1'/)
  assert.match(apply, /'starting_equipment','\[\]'::jsonb/)
  assert.match(apply, /'cantrip_long_rest_replacement','gena_popup_rpc'/)
  assert.match(apply, /'gena_rest_window_policy','first_assigned_player_message_closes_all_post_rest_choices'/)
})

test("new campaign Wizard install always applies subclass v3 before final closure", () => {
  const install = section(
    closure,
    "create or replace function private.install_wizard_subclass_runtime_for_new_campaign_v3",
    "revoke all on function private.install_wizard_subclass_runtime_for_new_campaign_v3",
  )

  const subclass = install.indexOf("perform private.install_wizard_subclass_runtime_v3(new.id)")
  const finalClosure = install.indexOf("perform private.apply_wizard_runtime_closure_v1(new.id)")
  assert.ok(subclass >= 0)
  assert.ok(finalClosure > subclass)
})

test("runtime closure repairs existing campaigns instead of only changing future triggers", () => {
  assert.match(closure, /for v_campaign in select id from public\.campaigns loop/)
  assert.match(closure, /perform private\.apply_wizard_runtime_closure_v1\(v_campaign\.id\)/)
})

test("Wizard closure remains private to clients", () => {
  assert.match(
    closure,
    /revoke all on function private\.apply_wizard_runtime_closure_v1\(uuid\) from public,anon,authenticated/,
  )
  assert.match(
    closure,
    /revoke all on function private\.install_wizard_subclass_runtime_for_new_campaign_v3\(\) from public,anon,authenticated/,
  )
})
