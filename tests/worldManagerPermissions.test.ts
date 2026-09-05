import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(
  "supabase/migrations/20260905050000_fix_manager_private_zone_access.sql",
  "utf8",
)
const returningPolicyMigration = fs.readFileSync(
  "supabase/migrations/20260905052000_fix_manager_location_insert_returning.sql",
  "utf8",
)

function functionBody(name: string): string {
  const match = migration.match(
    new RegExp(`create or replace function private\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  )
  assert.ok(match, `${name} must be declared in the manager zone permission migration`)
  return match[0]
}

test("GM and owner can read every managed zone, including another GM's private zone", () => {
  const body = functionBody("can_view_location")

  assert.match(body, /private\.is_campaign_member\(l\.campaign_id, p_user_id\)/)
  assert.match(body, /private\.can_manage_campaign\(l\.campaign_id, p_user_id\)/)
  assert.doesNotMatch(body, /visibility_mode\s*=\s*'private'\s+and\s+l\.created_by\s*=\s*p_user_id/)
})

test("players only read always-visible or explicitly discovered zones", () => {
  const body = functionBody("can_view_location")

  assert.match(body, /l\.visibility_mode\s*=\s*'always'/)
  assert.match(body, /l\.visibility_mode\s*=\s*'discover'/)
  assert.match(body, /public\.character_location_discoveries/)
  assert.doesNotMatch(body, /or\s+l\.visibility_mode\s*=\s*'private'/)
})

test("GM-only location links follow the same manager authority contract", () => {
  const body = functionBody("can_view_location_link")

  assert.match(body, /private\.can_manage_campaign\(l\.campaign_id, p_user_id\)/)
  assert.match(body, /private\.can_view_location\(l\.id, p_user_id\)/)
  assert.match(body, /private\.can_view_location\(link\.target_location_id, p_user_id\)/)
  assert.doesNotMatch(body, /visibility_mode\s*=\s*'private'\s+and\s+link\.created_by\s*=\s*p_user_id/)
})

test("private manager helpers remain outside the exposed public API", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/)
  assert.match(migration, /revoke all on function private\.can_view_location\(uuid, uuid\) from public, anon/)
  assert.match(migration, /grant execute on function private\.can_view_location\(uuid, uuid\) to authenticated, service_role/)
})

test("location INSERT returning checks manager authority against the candidate row", () => {
  assert.match(returningPolicyMigration, /drop policy if exists locations_member_read/)
  assert.match(returningPolicyMigration, /create policy locations_member_read[\s\S]*for select[\s\S]*to authenticated/)
  assert.match(returningPolicyMigration, /private\.can_manage_campaign\(campaign_id\)/)
  assert.match(returningPolicyMigration, /or \(select private\.can_view_location\(id\)\)/)
})
