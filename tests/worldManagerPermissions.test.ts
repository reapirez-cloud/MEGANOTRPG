import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const accessContractMigration = fs.readFileSync(
  "supabase/migrations/20260915210000_access_contract_hardening_v1.sql",
  "utf8",
)
const returningPolicyMigration = fs.readFileSync(
  "supabase/migrations/20260905052000_fix_manager_location_insert_returning.sql",
  "utf8",
)

function functionBody(name: string): string {
  const match = accessContractMigration.match(
    new RegExp("create or replace function private\\." + name + "\\([\\s\\S]*?\\n\\$\\$;", "i"),
  )
  assert.ok(match, name + " must be declared in the access-contract migration")
  return match[0]
}

test("private zones remain creator-only even across GM and owner accounts", () => {
  const viewBody = functionBody("can_view_location")
  const manageBody = functionBody("can_manage_location")

  assert.match(viewBody, /private\.is_campaign_member\(l\.campaign_id, p_user_id\)/)
  assert.match(
    viewBody,
    /l\.visibility_mode = 'private'[\s\S]*private\.is_owner_only_creator\(l\.created_by, p_user_id\)/,
  )
  assert.match(
    manageBody,
    /l\.visibility_mode <> 'private'[\s\S]*or private\.is_owner_only_creator\(l\.created_by, p_user_id\)/,
  )
  assert.match(
    viewBody,
    /l\.visibility_mode = 'private'\s*and private\.is_owner_only_creator\(l\.created_by, p_user_id\)\s*\)\s*or \(\s*l\.visibility_mode <> 'private'\s*and \(\s*private\.can_manage_campaign\(l\.campaign_id, p_user_id\)/,
  )
})

test("players only read always-visible or explicitly discovered zones", () => {
  const body = functionBody("can_view_location")

  assert.match(body, /l\.visibility_mode = 'always'/)
  assert.match(body, /l\.visibility_mode = 'discover'/)
  assert.match(body, /public\.character_location_discoveries/)
})

test("manager helpers remain outside anonymous API access", () => {
  assert.match(accessContractMigration, /security definer[\s\S]*set search_path = ''/)
  assert.match(
    accessContractMigration,
    /revoke all on function private\.can_view_location\(uuid, uuid\)[\s\S]*from public, anon/,
  )
  assert.match(
    accessContractMigration,
    /grant execute on function private\.can_view_location\(uuid, uuid\)[\s\S]*to authenticated, service_role/,
  )
})

test("location INSERT returning still allows managers to read their non-private rows", () => {
  assert.match(returningPolicyMigration, /drop policy if exists locations_member_read/)
  assert.match(
    returningPolicyMigration,
    /create policy locations_member_read[\s\S]*for select[\s\S]*to authenticated/,
  )
  assert.match(returningPolicyMigration, /private\.can_manage_campaign\(campaign_id\)/)
  assert.match(returningPolicyMigration, /or \(select private\.can_view_location\(id\)\)/)
})
