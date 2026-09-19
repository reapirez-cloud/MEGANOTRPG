import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { compileStoredMechanics } from "../supabase/functions/voss-agent/mechanics-compiler.ts"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Stage 12 historical migration persists compiler artifacts", () => {
  const migration = read(
    "supabase/migrations/20260914201500_mechanics_compiler_stage12.sql",
  )

  assert.match(migration, /create table if not exists public\.ai_mechanics_compilations/)
  assert.match(migration, /'mechanics_compile'::text/)
  assert.match(migration, /alter table public\.ai_mechanics_compilations enable row level security/)
  assert.match(migration, /ai_mechanics_compilations_creator_read/)
  assert.match(migration, /grant select on public\.ai_mechanics_compilations to authenticated/)
  assert.match(migration, /revoke insert, update, delete on public\.ai_mechanics_compilations/)
})

test("compiler accepts existing StoredMechanics primitives instead of inventing a second DSL", () => {
  const result = compileStoredMechanics([
    {
      id: "stage12-resource",
      type: "resource",
      sourceKey: "feature:stage12",
      key: "stage12_uses",
      label: "Использования",
      max: 2,
      recharge: "long_rest",
      initial: "full",
    },
    {
      id: "stage12-action",
      type: "action",
      sourceKey: "feature:stage12",
      key: "stage12_action",
      label: "Применить способность",
      economy: "bonus_action",
      resourceCosts: [{ key: "stage12_uses", amount: 1 }],
      effects: [
        {
          kind: "semantic",
          key: "stage12_effect",
          payload: { rule: "GM resolves the scene consequence." },
        },
      ],
    },
  ])

  assert.equal(result.ok, true)
  assert.equal(result.mechanics.length, 2)
  assert.deepEqual(
    result.mechanics.map((mechanic) => mechanic.type),
    ["resource", "action"],
  )
})

test("compiler requires stable provenance and rejects invented mechanic fields", () => {
  const result = compileStoredMechanics([
    {
      id: "bad-mechanic",
      type: "numeric",
      target: "combat.maxHp",
      operation: "ADD",
      value: 1,
      magicAiField: true,
    },
  ])

  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some((item) => item.code === "mechanic_source_key"))
  assert.ok(result.diagnostics.some((item) => item.code === "unsupported_field"))
})

test("compiler rejects fake scene and turn state instead of automating the GM", () => {
  const result = compileStoredMechanics([
    {
      id: "fake-turn",
      type: "action",
      sourceKey: "feature:fake",
      key: "fake_turn_action",
      label: "Плохая автоматизация",
      economy: "reaction",
      requirements: [
        {
          kind: "condition",
          condition: {
            kind: "state",
            key: "reaction_available",
            operator: "EQUALS",
            value: true,
          },
        },
      ],
      effects: [
        {
          kind: "state",
          key: "hit_confirmed",
          operation: "SET",
          value: true,
        },
      ],
    },
  ])

  assert.equal(result.ok, false)
  assert.ok(
    result.diagnostics.filter(
      (item) => item.code === "gm_scene_state_not_authoritative",
    ).length >= 2,
  )
})

test("compiler rejects GM-enforced runtime requirements and keeps adjudication in rule text", () => {
  const result = compileStoredMechanics([
    {
      id: "gm-requirement",
      type: "action",
      sourceKey: "feature:gm-boundary",
      key: "gm_boundary_action",
      label: "Проверить сцену",
      economy: "action",
      requirements: [
        {
          kind: "condition",
          enforcement: "gm",
          label: "Цель видима",
          condition: { kind: "always" },
        },
      ],
    },
  ])

  assert.equal(result.ok, false)
  assert.ok(
    result.diagnostics.some(
      (item) => item.code === "gm_requirement_not_runtime",
    ),
  )
})

test("persistent resource compiler refuses per-turn recharge", () => {
  const result = compileStoredMechanics([
    {
      id: "turn-resource",
      type: "resource",
      sourceKey: "feature:turn",
      key: "turn_resource",
      label: "Псевдоресурс",
      max: 1,
      recharge: "turn",
    },
  ])

  assert.equal(result.ok, false)
  assert.ok(
    result.diagnostics.some((item) => item.code === "resource_recharge"),
  )
})

test("compiler validates action costs and ordinary durable resource flow", () => {
  const result = compileStoredMechanics([
    {
      id: "pool",
      type: "resource",
      sourceKey: "feature:pool",
      key: "pool",
      label: "Запас",
      max: {
        kind: "add",
        terms: [
          { kind: "literal", value: 1 },
          { kind: "reference", key: "core.proficiencyBonus" },
        ],
      },
      recharge: ["short_rest", "long_rest"],
    },
    {
      id: "spend-pool",
      type: "action",
      sourceKey: "feature:pool",
      key: "spend_pool",
      label: "Потратить запас",
      economy: "special",
      resourceCosts: [{ key: "pool", amount: 1 }],
      effects: [
        { kind: "resource", key: "pool", operation: "RESTORE", amount: 1 },
      ],
    },
  ])

  assert.equal(result.ok, true)
  assert.equal(result.diagnostics.filter((item) => item.severity === "error").length, 0)
})

test("Mechanics Compiler remains available as an external subsystem but is not exposed to Voss", () => {
  const tools = read("supabase/functions/voss-agent/mechanics-tools.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(tools, /name: "compile_mechanics"/)
  assert.match(tools, /name: "apply_mechanics_compilation"/)
  assert.doesNotMatch(edge, /VOSS_MECHANICS_TOOLS/)
  assert.doesNotMatch(edge, /executeVossMechanicsTool/)
  assert.doesNotMatch(edge, /isVossMechanicsTool/)
  assert.match(edge, /Новые игровые механики ты не проектируешь и не внедряешь/)
})

test("coverage must distinguish CE, GM and hybrid without fake runtime mechanics", () => {
  const tools = read("supabase/functions/voss-agent/mechanics-tools.ts")

  assert.match(tools, /enum: \["ce", "gm", "hybrid"\]/)
  assert.match(tools, /coverage_missing_ce_mechanics/)
  assert.match(tools, /gm_coverage_has_runtime_mechanics/)
  assert.match(tools, /GM-only adjudication must not be represented by executable mechanics/)
})

test("compiler subsystem still detects unsupported durable capabilities", () => {
  const tools = read("supabase/functions/voss-agent/mechanics-tools.ts")

  assert.match(tools, /unsupported_requirements/)
  assert.match(tools, /status = hasErrors \|\| unsupported\.length/)
  assert.match(tools, /needs_developer_mode/)
})

test("historical compiler still protects built-in class and subclass packages", () => {
  const migration = read(
    "supabase/migrations/20260914201500_mechanics_compiler_stage12.sql",
  )
  const tools = read("supabase/functions/voss-agent/mechanics-tools.ts")

  assert.match(migration, /if v_template\.is_builtin then/)
  assert.match(migration, /builtin_template_requires_developer_mode/)
  assert.match(tools, /builtin_preview_only/)
  assert.match(tools, /Built-in class\/subclass mechanics may be previewed/)
})

test("apply gate detects stale targets instead of overwriting newer mechanics", () => {
  const migration = read(
    "supabase/migrations/20260914201500_mechanics_compiler_stage12.sql",
  )

  assert.match(migration, /mechanics_target_conflict/)
  assert.match(migration, /v_definition\.current_revision <> v_expected_revision/)
  assert.match(
    migration,
    /coalesce\(v_comp\.target_snapshot->'mechanics','\[\]'::jsonb\)[\s\S]*?<> coalesce\(v_template\.mechanics,'\[\]'::jsonb\)/,
  )
  assert.match(
    migration,
    /coalesce\(v_comp\.target_snapshot->'mechanics','\[\]'::jsonb\)[\s\S]*?<> coalesce\(v_level\.mechanics,'\[\]'::jsonb\)/,
  )
})

test("Voss content drafts reject mechanics while canonical apply keeps compiler provenance checks", () => {
  const draftTools = read("supabase/functions/voss-agent/draft-tools.ts")
  const applyDraft = read("src/ai/applyDraft.ts")

  assert.match(draftTools, /containsMechanicsPayload/)
  assert.match(draftTools, /Voss does not author mechanics in content drafts/)
  assert.match(applyDraft, /verifyCompiledMechanics/)
  assert.match(applyDraft, /from\("ai_mechanics_compilations"\)/)
  assert.match(applyDraft, /\["validated", "applied"\]\.includes\(data\.status\)/)
  assert.match(applyDraft, /stableJson\(data\.mechanics\) !== stableJson\(rawMechanics\)/)
})

test("Voss router no longer exposes mechanics authoring as a task", () => {
  const router = read("supabase/functions/voss-agent/model-router.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.doesNotMatch(router, /\| "mechanics_compile"/)
  assert.doesNotMatch(router, /return "mechanics_compile"/)
  assert.match(edge, /isMechanicsAuthoringRequest/)
  assert.match(edge, /const scopedDraftTools[\s\S]*!mechanicsAuthoringRequested[\s\S]*VOSS_DRAFT_TOOLS/)
})

test("Voss chat no longer presents Mechanics Compiler controls", () => {
  const shell = read("src/ai/AgentShell.tsx")

  assert.doesNotMatch(shell, /MECHANICS COMPILER/)
  assert.doesNotMatch(shell, /mechanicsStatus/)
  assert.doesNotMatch(shell, /Примени компиляцию механик/)
})
