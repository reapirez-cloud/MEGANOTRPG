import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")
const migration = read(
  "supabase/migrations/20260926131508_replace_grok46_with_grok47_v1.sql",
)

test("Grok 4.7 is the current GM model with 500k context and vision", () => {
  assert.match(migration, /model_key='grok-4\.7'/)
  assert.match(migration, /display_name='Grok 4\.7'/)
  assert.match(migration, /context_window=500000/)
  assert.match(migration, /supports_vision=true/)
  assert.match(migration, /supports_tools=true/)
  assert.match(migration, /supports_json=true/)
})

test("Grok 4.7 uses high reasoning by default", () => {
  assert.match(
    gateway,
    /model\.model_key === "grok-4\.7"[\s\S]{0,100}return "high"/,
  )
})

test("Grok 4.6 registry is replaced in place rather than creating a second row", () => {
  assert.match(migration, /where model_key='grok-4\.6'/)
  assert.match(migration, /set model_key='grok-4\.7'/)
})
