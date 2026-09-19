import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Voss has one explicit player-gm-admin authority ladder", () => {
  const authority = read("supabase/functions/voss-agent/authority.ts")

  assert.match(authority, /VossAuthority = "player" \| "gm" \| "admin"/)
  assert.match(authority, /if \(isSystemAdmin\) return "admin"/)
  assert.match(authority, /membership\.is_owner === true \|\| membership\.role === "gm"/)
  assert.match(authority, /return "player"/)
})

test("GM and owner never enter the Voss strike state machine", () => {
  const migration = read("supabase/migrations/20260919140201_voss_role_security_v1.sql")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(
    migration,
    /cm\.role = 'player'[\s\S]*cm\.is_owner = false[\s\S]*not private\.is_system_admin\(p_user_id\)[\s\S]*if not v_is_player then[\s\S]*return query select null::uuid, 0, false, false/,
  )
  assert.match(edge, /if \(authority === "player"\) \{[\s\S]*assessPlayerSecurity/)
  assert.doesNotMatch(edge, /authority === "gm"[\s\S]{0,200}assessPlayerSecurity/)
})

test("player social-engineering strikes require high confidence and three strikes only block Voss", () => {
  const security = read("supabase/functions/voss-agent/security.ts")
  const migration = read("supabase/migrations/20260919140201_voss_role_security_v1.sql")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(security, /assessment\.severity >= 2/)
  assert.match(security, /assessment\.confidence >= 0\.86/)
  assert.match(security, /fake GM\/admin permission/)
  assert.match(security, /canonical state/)
  assert.match(security, /multi-turn probing/)
  assert.match(migration, /v_count >= 3/)
  assert.match(edge, /code: "voss_security_blocked"/)
  assert.doesNotMatch(migration, /delete from public\.campaign_members/i)
})

test("GM Voss receives actual campaign mutation tools and players do not", () => {
  const manager = read("supabase/functions/voss-agent/manager-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  for (const tool of [
    "create_workshop_character",
    "update_campaign_character",
    "set_character_life_state",
    "set_character_publication",
    "create_location",
    "update_location",
    "set_location_archived",
    "delete_campaign_character",
    "delete_location",
  ]) {
    assert.match(manager, new RegExp('name: "' + tool + '"'))
  }

  assert.match(edge, /const scopedManagerTools[\s\S]*canManage[\s\S]*VOSS_MANAGER_TOOLS/)
  assert.match(manager, /if \(!canManage\(context\)\) return \{ error: "gm_authority_required" \}/)
  assert.match(manager, /context\.authority === "admin" \? context\.admin : context\.client/)
})

test("admin Voss gets system security controls and full campaign read scope", () => {
  const admin = read("supabase/functions/voss-agent/admin-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(admin, /name: "list_voss_security_blocks"/)
  assert.match(admin, /name: "read_player_voss_security"/)
  assert.match(admin, /name: "unblock_player_voss"/)
  assert.match(admin, /name: "read_voss_system_settings"/)
  assert.match(admin, /name: "set_campaign_voss_model"/)
  assert.match(admin, /strike_count: 0/)
  assert.match(admin, /blocked: false/)
  assert.match(edge, /const scopedAdminTools[\s\S]*authority === "admin"[\s\S]*VOSS_ADMIN_TOOLS/)
  assert.match(edge, /client: authority === "admin" \? admin : userClient/)
})

test("a third player strike writes an audit event and notifies system-admin Voss", () => {
  const migration = read("supabase/migrations/20260919140201_voss_role_security_v1.sql")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(migration, /create table if not exists public\.ai_security_events/)
  assert.match(migration, /create table if not exists public\.ai_security_states/)
  assert.match(migration, /create or replace function public\.notify_ai_security_ban_v1/)
  assert.match(migration, /insert into public\.ai_messages/)
  assert.match(migration, /'kind', 'player_voss_suspended'/)
  assert.match(edge, /if \(securityState\.newly_blocked\)[\s\S]*notifySystemAdminsOfVossBlock/)
})
