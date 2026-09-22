import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const gate = fs.readFileSync("src/components/auth/AuthGate.tsx", "utf8")
const migration = fs.readFileSync(
  "supabase/migrations/20260922204500_ai_world_slots_v1.sql",
  "utf8",
)

test("world selector exposes Muntar and a password-gated experimental AI branch", () => {
  assert.match(gate, /phase === "world-select"/)
  assert.match(gate, />Мунтар</)
  assert.match(gate, />ИИ мир</)
  assert.match(gate, /phase === "ai-unlock"/)
  assert.match(gate, /type="password"/)
  assert.match(gate, /AI_WORLD_PASSWORD = \[1, 4, 8, 8\]\.join\(""/)
})

test("AI world owns exactly five persistent nameable slots per authenticated owner", () => {
  assert.match(gate, /AI_WORLD_SLOT_COUNT = 5/)
  assert.match(gate, /\.from\("ai_world_slots"\)/)
  assert.match(gate, /slot_index/)
  assert.match(gate, /name: nextName/)
  assert.match(gate, /phase === "ai-slots"/)

  assert.match(migration, /slot_index smallint not null check \(slot_index between 1 and 5\)/i)
  assert.match(migration, /unique \(owner_user_id, slot_index\)/i)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /to authenticated[\s\S]*auth\.uid\(\)[\s\S]*owner_user_id/i)
  assert.doesNotMatch(migration, /to anon/i)
})
