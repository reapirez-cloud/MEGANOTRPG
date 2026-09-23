import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { AI_WORLD_EVOLUTION_STAGES } from "../src/ai-world-evolution/contract.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20260923174503_ai_world_evolution_stage4_shared_bestiary_compiler_v1.sql", import.meta.url),
  "utf8",
)
const worker = readFileSync(
  new URL("../supabase/functions/npc-runtime/index.ts", import.meta.url),
  "utf8",
)

test("AI world evolution Stage 4 is certified on one shared compiler boundary", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 4)
  assert.ok(stage)
  assert.equal(stage.status, "certified")
  assert.match(migration, /private\.compile_bestiary_runtime_v1/)
  assert.match(migration, /public\.compile_bestiary_runtime_v1/)
  assert.match(migration, /'compiler','bestiary-runtime'/)
  assert.match(migration, /'compiler_version',1/)
  assert.match(migration, /'source_digest'/)
})

test("compiled representation is actor-neutral and covers sheet, mechanics, resources and recharge", () => {
  const compilerStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION private.compile_bestiary_runtime_v1",
  )
  const publicStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.compile_bestiary_runtime_v1",
  )
  assert.ok(compilerStart >= 0 && publicStart > compilerStart)
  const compiler = migration.slice(compilerStart, publicStart)

  assert.match(compiler, /'sheet',jsonb_build_object/)
  assert.match(compiler, /'mechanics',v_mechanics/)
  assert.match(compiler, /'resources',v_resources/)
  assert.match(compiler, /saving_throw_proficiencies/)
  assert.match(compiler, /skill_proficiencies/)
  assert.match(compiler, /special_abilities/)
  assert.doesNotMatch(compiler, /p_npc_id|character_id/)
  assert.match(migration, /"triggers":\["long_rest"\],"restore":"full"/)
  assert.match(migration, /"triggers":\["special"\],"restore":"full"/)
})

test("shared mechanic compiler owns numeric attack, damage and save mechanics", () => {
  assert.match(migration, /'attackBonus',v_attack_bonus/)
  assert.match(migration, /'diceCount'/)
  assert.match(migration, /'diceSides'/)
  assert.match(migration, /'diceModifier'/)
  assert.match(migration, /'damageComponents'/)
  assert.match(migration, /'saveDc'/)
  assert.match(migration, /'saveAbility'/)
  assert.match(migration, /bestiary_runtime_dice_v1/)
})

test("canonical NPC Stage 6 consumes compiled output instead of recompiling bestiary actions", () => {
  const applyStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.apply_ai_gm_npc_runtime_build_v1",
  )
  assert.ok(applyStart >= 0)
  const applyBody = migration.slice(applyStart)

  assert.match(
    applyBody,
    /v_compiled := private\.compile_bestiary_runtime_v1\(p_bestiary_slug\)/,
  )
  assert.match(applyBody, /bestiary_runtime_mechanic_for_npc_v1/)
  assert.match(applyBody, /jsonb_array_elements\(coalesce\(v_compiled->'resources'/)
  assert.doesNotMatch(
    applyBody,
    /jsonb_array_elements\(coalesce\(v_bestiary\.(actions|reactions|special_abilities)/,
  )
})

test("NPC adapter preserves legacy CE ids while shared snapshot remains reusable", () => {
  assert.match(migration, /'npc-runtime-'\|\|v_kind\|\|'-'\|\|v_ordinal/)
  assert.match(migration, /'npc_runtime_'\|\|v_kind\|\|'_'\|\|v_ordinal/)
  assert.match(migration, /'sourceKey','npc-runtime:'\|\|p_npc_id::text/)
  assert.match(migration, /'npcRuntime',coalesce\(p_compiled->'runtime'/)
})

test("models still select only a bestiary slug and never provide numeric mechanics", () => {
  assert.match(worker, /Не придумывай новые числа, атаки, заклинания или ресурсы/)
  assert.match(worker, /allowed\.has\(requestedSlug\)/)
  assert.match(worker, /p_bestiary_slug: selected/)
  assert.doesNotMatch(worker, /p_attack_bonus|p_damage_dice|p_save_dc|p_resource_cost/)
})

test("shared compiler public surface is service-only", () => {
  assert.match(
    migration,
    /if auth\.role\(\) <> 'service_role' then[\s\S]*raise exception 'service_role_required'/,
  )
  assert.match(
    migration,
    /revoke all on function public\.compile_bestiary_runtime_v1\(text\)[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    migration,
    /grant execute on function public\.compile_bestiary_runtime_v1\(text\)[\s\S]*to service_role/,
  )
})
