import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath = new URL(
  "../supabase/migrations/20260922211500_chat_owner_player_send_identity_fix.sql",
  import.meta.url,
)
const speakersPath = new URL(
  "../src/ui-v1-isolated/chat-room/useChatSpeakerOptions.ts",
  import.meta.url,
)

test("owner-player keeps their playable PC identity while retaining manager authority", async () => {
  const [sql, speakers] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(speakersPath, "utf8"),
  ])

  assert.match(sql, /v_can_manage := v_is_owner or v_role = 'gm'/)
  assert.match(
    sql,
    /if v_role = 'player'[\s\S]*v_character\.character_type = 'pc'[\s\S]*v_character\.assigned_user_id = auth\.uid\(\)/,
  )
  assert.match(
    sql,
    /v_active_character_id = v_character\.id[\s\S]*r\.room_type = 'character'[\s\S]*r\.character_id = v_character\.id/,
  )
  assert.match(
    speakers,
    /viewerRole === "player" && playerCharacterId/,
  )
})

test("owner-player fix does not turn manager authority into arbitrary PC impersonation", async () => {
  const sql = await readFile(migrationPath, "utf8")

  assert.match(
    sql,
    /v_character\.assigned_user_id = auth\.uid\(\)/,
  )
  assert.match(
    sql,
    /v_character\.character_type = 'npc'[\s\S]*chat_actor_bindings/,
  )
  assert.match(
    sql,
    /revoke all on function public\.set_chat_message_identity\(\) from public, anon, authenticated/,
  )
})
