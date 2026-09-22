import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const managerTools = fs.readFileSync(
  "supabase/functions/voss-agent/manager-tools.ts",
  "utf8",
)
const readTools = fs.readFileSync(
  "supabase/functions/voss-agent/read-tools.ts",
  "utf8",
)
const agentIndex = fs.readFileSync(
  "supabase/functions/voss-agent/index.ts",
  "utf8",
)
const migration = fs.readFileSync(
  "supabase/migrations/20260922221255_location_secrets_stage7_v1.sql",
  "utf8",
)

test("stage 7 creates persistent location secrets with revision history", () => {
  assert.match(migration, /create table public\.location_secrets/i)
  assert.match(migration, /create table public\.location_secret_revisions/i)
  assert.match(migration, /secret_key text not null/i)
  assert.match(migration, /status in \('active','resolved','retired'\)/)
  assert.match(migration, /record_location_secret_revision_v1/)
})

test("location secrets stay manager-only under RLS", () => {
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /private\.can_manage_location\(location_id\)/)
  assert.match(migration, /revoke all on table public\.location_secrets from anon/i)
  assert.doesNotMatch(migration, /grant select[^;]*location_secrets[^;]*to anon/i)
})

test("Freddy has explicit secret write and lifecycle tools", () => {
  assert.match(managerTools, /name: "upsert_location_secret"/)
  assert.match(managerTools, /name: "set_location_secret_state"/)
  assert.match(managerTools, /upsert_location_secret_v1/)
  assert.match(managerTools, /set_location_secret_state_v1/)
})

test("read_location only returns secret payload for manager authority", () => {
  assert.match(readTools, /from\("location_secrets"\)/)
  assert.match(readTools, /from\("location_secret_revisions"\)/)
  assert.match(readTools, /context\.canManage \? \{ locationSecrets \} : \{\}/)
})

test("location secrets are distinct from quest secrets and do not auto-publish", () => {
  assert.match(agentIndex, /постоянная скрытая часть канонического мира/)
  assert.match(agentIndex, /не держи только в заметке квеста/)
  assert.match(agentIndex, /не публикует этот текст игроку автоматически/)
  assert.match(agentIndex, /set_location_secret_state сохраняет историю ревизий/)
})

test("secret lifecycle is revisioned instead of destructive deletion", () => {
  assert.match(migration, /change_kind/)
  assert.match(migration, /status_changed/)
  assert.match(migration, /revision bigint not null/)
  assert.doesNotMatch(managerTools, /name: "delete_location_secret"/)
})

test("raw secret tables are not added to Supabase realtime", () => {
  assert.doesNotMatch(migration, /alter publication supabase_realtime/i)
})
