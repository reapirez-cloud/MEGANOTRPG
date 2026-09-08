import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sql = fs.readFileSync("supabase/migrations/20260908192000_sorcerer_stage2_resource_runtime_v1.sql", "utf8")

test("stage 2 installs one canonical Sorcery Point resource and assignment sync", () => {
  assert.equal((sql.match(/'key','sorcery_points','label','Очки чародейства'/g) || []).length, 1)
  assert.match(sql, /'max',jsonb_build_object\('kind','reference','key','source\.level'\)/)
  assert.match(sql, /private\.sync_sorcerer_character_resource_states_stage2_v1/)
  assert.match(sql, /state_key in \('innate_sorcery','sorcery_points','sorcerous_restoration'\)/)
})

test("stage 2 restoration progression matches floor half Sorcerer level", () => {
  assert.match(sql, /\(7,3\),\(9,4\),\(11,5\),\(13,6\),\(15,7\),\(17,8\),\(19,9\),\(20,10\)/)
  assert.match(sql, /values\.sorcerous_restoration_amount/)
  assert.match(sql, /'operation','RESTORE'/)
})
