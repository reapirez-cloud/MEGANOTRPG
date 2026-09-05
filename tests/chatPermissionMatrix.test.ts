import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const hookPath = new URL("../src/hooks/useChatActors.ts", import.meta.url)
const migrationPath = new URL(
  "../supabase/migrations/20260905060000_fix_manager_chat_actor_permissions.sql",
  import.meta.url,
)

test("chat actor picker exposes every visible living character to managers", async () => {
  const source = await readFile(hookPath, "utf8")

  assert.match(source, /if \(character\.life_state === "dead"\) continue/)
  assert.match(source, /const availableToManager = canManage/)
  assert.match(source, /const availableToPlayer = !canManage && ownActivePc/)
  assert.doesNotMatch(source, /chat_actor_bindings/)
})

test("players can select only their assigned active living PC", async () => {
  const source = await readFile(hookPath, "utf8")

  assert.match(
    source,
    /const ownActivePc = character\.character_type === "pc"[\s\S]*character\.assigned_user_id === user\.id[\s\S]*character\.id === activeCharacter\?\.id/,
  )
})

test("database accepts visible campaign actors for managers and keeps players scoped", async () => {
  const sql = await readFile(migrationPath, "utf8")

  assert.match(sql, /v_can_manage := v_is_owner or v_role = 'gm'/)
  assert.match(
    sql,
    /if v_can_manage then[\s\S]*private\.can_view_character\(v_character\.id, auth\.uid\(\)\)/,
  )
  assert.match(
    sql,
    /elsif not \([\s\S]*v_character\.character_type = 'pc'[\s\S]*v_character\.assigned_user_id = auth\.uid\(\)[\s\S]*v_active_character_id = v_character\.id/,
  )
  assert.doesNotMatch(sql, /chat_actor_bindings/)
  assert.match(
    sql,
    /revoke all on function public\.set_chat_message_identity\(\) from public, anon, authenticated/,
  )
})
