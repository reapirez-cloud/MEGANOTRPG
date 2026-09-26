import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260926190721_ai_gm_post_turn_latest_turn_status_v1.sql",
    import.meta.url,
  ),
  "utf8",
)

test("AI-GM room status scopes post-turn failures to the latest conversation turn", () => {
  assert.match(
    migration,
    /select \* into v_job[\s\S]*order by j\.created_at desc,j\.id desc[\s\S]*limit 1;/,
  )
  assert.match(
    migration,
    /where c\.parent_job_id=v_job\.id[\s\S]*and c\.room_id=p_room_id/,
  )
})

test("superseded AI-GM revisions cannot retry historical post-turn commits", () => {
  assert.match(
    migration,
    /where r\.job_id=v_commit\.parent_job_id/,
  )
  assert.match(
    migration,
    /v_revision\.id is null or v_revision\.state<>'active'/,
  )
  assert.match(migration, /stage18_commit_superseded/)
})
