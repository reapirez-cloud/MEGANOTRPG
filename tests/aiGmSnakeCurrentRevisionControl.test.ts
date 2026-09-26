import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260926185343_ai_gm_snake_current_revision_control_v1.sql",
    import.meta.url,
  ),
  "utf8",
)

test("Snake controls normalize stale AI-GM replies to the current source-turn revision", () => {
  assert.match(migration, /v_current private\.ai_gm_turn_revisions%rowtype/)
  assert.match(
    migration,
    /where r\.source_message_id=v_revision\.source_message_id[\s\S]*order by \(r\.state='active'\) desc, r\.revision_no desc/,
  )
  assert.match(migration, /v_revision:=v_current/)
  assert.match(
    migration,
    /Returns Snake controls for the current AI-GM branch of a source turn/,
  )
})
