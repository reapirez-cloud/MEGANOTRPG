import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const gate = fs.readFileSync("src/components/auth/AuthGate.tsx", "utf8")
const migration = fs.readFileSync(
  "supabase/migrations/20260922204500_ai_world_slots_v1.sql",
  "utf8",
)
const slotLockMigration = fs.readFileSync(
  "supabase/migrations/20260926155500_ai_world_slot1_password_and_painterly_art_v1.sql",
  "utf8",
)
const dynamicMediaPromptMigration = fs.readFileSync(
  "supabase/migrations/20260926161000_ai_world_painterly_dynamic_media_prompts_v1.sql",
  "utf8",
)

test("world selector opens the experimental AI slot list without a global password", () => {
  assert.match(gate, /phase === "world-select"/)
  assert.match(gate, />Мунтар</)
  assert.match(gate, />ИИ мир</)
  assert.match(gate, /onClick=\{\(\) => void loadAiSlots\(\)\}/)
  assert.doesNotMatch(gate, /AI_WORLD_PASSWORD/)
  assert.doesNotMatch(gate, /phase === "ai-unlock"/)
})

test("AI world owns exactly five persistent nameable slots per authenticated owner", () => {
  assert.match(gate, /AI_WORLD_SLOT_COUNT = 5/)
  assert.match(gate, /\.from\("ai_world_slots"\)/)
  assert.match(gate, /slot_index/)
  assert.match(gate, /name: nextName/)
  assert.match(gate, /phase === "ai-slots"/)

  assert.match(migration, /slot_index smallint not null check \(slot_index between 1 and 5\)/i)
  assert.match(migration, /unique \(owner_user_id, slot_index\)/i)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /to authenticated[\s\S]*auth\.uid\(\)[\s\S]*owner_user_id/i)
  assert.doesNotMatch(migration, /to anon/i)
})


test("AI world room one has a second server-enforced access code while rooms two through five remain direct", () => {
  assert.match(gate, /phase === "ai-slot-unlock"/)
  assert.match(gate, /slot\.id === PROTECTED_AI_WORLD_SLOT_ID/)
  assert.match(gate, /open_ai_world_slot_v3/)
  assert.match(gate, /p_access_code/)
  assert.match(slotLockMigration, /ai_world_slot_access_code_required/)
  assert.match(slotLockMigration, /ai_world_slot_access_code_invalid/)
  assert.match(slotLockMigration, /extensions\.digest\(coalesce\(p_access_code,''\),'sha256'\)/)
  assert.match(
    slotLockMigration,
    /9d693eeee1d1899cbc50b6d45df953d3835acf28ee869879b45565fccc814765/,
  )
  assert.match(
    slotLockMigration,
    /if v_slot\.slot_index=1 then[\s\S]*v_code_hash/,
  )
})

test("AI world image policy uses painterly illustrated rendering and target prompts cannot reintroduce semi-realistic vector style", () => {
  assert.match(
    slotLockMigration,
    /Stylized painterly digital fantasy illustration with vector-inspired shape discipline, not photorealism/,
  )
  assert.match(slotLockMigration, /uncanny-valley realism/)
  assert.match(slotLockMigration, /Avoid photorealism, hyperreal concept art, 3D render aesthetics/)
  assert.match(
    dynamicMediaPromptMigration,
    /campaign visual style supplied by the AI-world slot/,
  )
  assert.match(dynamicMediaPromptMigration, /no photorealism, no 3D-render look/)
  assert.match(
    dynamicMediaPromptMigration,
    /polished semi-realistic vector dark-fantasy art/,
  )
})
