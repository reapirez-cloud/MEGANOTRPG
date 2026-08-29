import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sql = fs.readFileSync("supabase/migrations/20260830013000_class_chat_template_action_runtime.sql", "utf8")

function indexOfOrFail(value: string) {
  const index = sql.indexOf(value)
  assert.ok(index >= 0, `missing ${value}`)
  return index
}

test("class chat action executes the server template mechanic before posting the event", () => {
  const actionStart = indexOfOrFail("create or replace function public.send_chat_template_action_v1")
  const rollStart = indexOfOrFail("create or replace function public.send_chat_template_roll_v1")
  const actionBody = sql.slice(actionStart, rollStart)
  assert.ok(actionBody.indexOf("public.use_character_template_resource_action") < actionBody.indexOf("public.send_chat_event_v3"))
  assert.match(actionBody, /'templateMechanicId',trim\(p_mechanic_id\)/)
  assert.match(actionBody, /public\.send_chat_event_v3\([\s\S]*?'\[\]'::jsonb[\s\S]*?\)/)
})

test("class chat roll executes the same server template mechanic before rolling", () => {
  const rollStart = indexOfOrFail("create or replace function public.send_chat_template_roll_v1")
  const rollBody = sql.slice(rollStart)
  assert.ok(rollBody.indexOf("public.use_character_template_resource_action") < rollBody.indexOf("public.send_chat_roll_v3"))
  assert.match(rollBody, /public\.send_chat_roll_v3\([\s\S]*?'\[\]'::jsonb[\s\S]*?\)/)
})

test("class chat wrapper delegates spending exactly once", () => {
  const occurrences = [...sql.matchAll(/private\.consume_character_resource_costs/g)]
  assert.equal(occurrences.length, 0, "wrapper must not duplicate the canonical template action spender")
  assert.match(sql, /same PostgreSQL transaction/i)
})
