import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const hardening = fs.readFileSync(
  "supabase/migrations/20260915210000_access_contract_hardening_v1.sql",
  "utf8",
)
const memberAdmin = fs.readFileSync(
  "supabase/migrations/20260913193451_gm_party_member_and_invite_admin_v1.sql",
  "utf8",
)

test("future public functions require explicit API grants", () => {
  assert.match(
    hardening,
    /alter default privileges in schema public[\s\S]*revoke execute on functions from public, anon, authenticated/,
  )
  assert.match(
    hardening,
    /revoke execute on all functions in schema public from public, anon/,
  )
})

test("identity and membership authority cannot be edited directly by clients", () => {
  for (const table of [
    "campaign_members",
    "campaign_invites",
    "telegram_identities",
  ]) {
    assert.match(
      hardening,
      new RegExp(
        "revoke insert, update, delete, truncate, references, trigger[\\s\\S]*on table public\\." +
          table +
          "[\\s\\S]*from public, anon, authenticated",
      ),
    )
  }

  assert.match(
    hardening,
    /campaign_members must not be directly mutable by authenticated/,
  )
  assert.match(
    hardening,
    /telegram_identities must not be directly mutable by authenticated/,
  )
})

test("server-only security tables stay outside the Data API", () => {
  for (const table of [
    "ai_dev_sessions",
    "character_spell_legacy_archive",
    "engine_command_receipts",
  ]) {
    assert.match(
      hardening,
      new RegExp(
        "revoke all on table public\\." +
          table +
          "[\\s\\S]*from public, anon, authenticated",
      ),
    )
  }
})

test("owner-only membership administration is enforced in RPCs", () => {
  assert.match(
    hardening,
    /set_campaign_member_role[\s\S]*private\.is_campaign_owner\(p_campaign_id, auth\.uid\(\)\)/,
  )
  assert.match(
    memberAdmin,
    /remove_campaign_member_v1[\s\S]*private\.is_campaign_owner\(p_campaign_id, auth\.uid\(\)\)/,
  )
  assert.match(hardening, /p_role not in \('gm', 'player'\)/)
})

test("migration aborts if core RLS or anonymous-access invariants drift", () => {
  assert.match(hardening, /Public tables without RLS/)
  assert.match(hardening, /Anonymous table privileges detected/)
  assert.match(hardening, /Anonymous SECURITY DEFINER RPCs detected/)
})
