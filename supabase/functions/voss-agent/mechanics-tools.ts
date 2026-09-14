import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

import {
  compileStoredMechanics,
  MECHANICS_COMPILER_VERSION,
  type MechanicsDiagnostic,
} from "./mechanics-compiler.ts"

type JsonRecord = Record<string, unknown>

type MechanicsToolContext = {
  userClient: SupabaseClient
  admin: SupabaseClient
  campaignId: string
  userId: string
  threadId: string
  canManage: boolean
  viewContext: JsonRecord
}

type CoverageOwner = "ce" | "gm" | "hybrid"

type CoverageRow = {
  rule: string
  owner: CoverageOwner
  mechanic_ids: string[]
  note: string
}

const TOOL_NAMES = new Set([
  "compile_mechanics",
  "read_mechanics_compilation",
  "list_recent_mechanics_compilations",
  "apply_mechanics_compilation",
])

export const VOSS_MECHANICS_TOOLS = [
  {
    type: "function",
    function: {
      name: "compile_mechanics",
      description:
        "Compile a proposed rule into the existing MEGANOT StoredMechanics/Character Engine DSL. This never applies canonical changes. Classify every rule clause as CE-owned, GM-adjudicated or hybrid. Never invent fake scene/turn state. If the existing DSL cannot express a required durable mechanic, put it in unsupported_requirements instead of faking it.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: {
            type: "string",
            description: "Short human title for the mechanics compilation.",
          },
          intent: {
            type: "string",
            description: "Exact mechanic/rule intent being compiled.",
          },
          mechanics: {
            type: "array",
            maxItems: 64,
            description:
              "Candidate StoredMechanics array using only existing mechanic types: numeric, formula, grant, resource, action, spell. Every mechanic must have stable id and sourceKey.",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
          coverage: {
            type: "array",
            minItems: 1,
            maxItems: 32,
            description:
              "Rule coverage. CE means durable deterministic app state; gm means scene/action/narrative adjudication with no fake runtime state; hybrid means CE implements only the durable portion.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                rule: { type: "string" },
                owner: {
                  type: "string",
                  enum: ["ce", "gm", "hybrid"],
                },
                mechanic_ids: {
                  type: "array",
                  maxItems: 32,
                  items: { type: "string" },
                },
                note: { type: "string" },
              },
              required: ["rule", "owner", "mechanic_ids"],
            },
          },
          unsupported_requirements: {
            type: "array",
            maxItems: 20,
            items: { type: "string" },
            description:
              "Required durable capabilities that the current CE DSL does not support. Non-empty means the compilation must not be applied and should be escalated to Developer Mode later.",
          },
          target: {
            type: "object",
            additionalProperties: false,
            description:
              "Optional existing campaign target. Omit or use preview when only designing. Built-in class/subclass templates may be previewed but cannot be runtime-applied.",
            properties: {
              kind: {
                type: "string",
                enum: [
                  "preview",
                  "reference_definition",
                  "rule_template",
                  "rule_template_level",
                ],
              },
              id: { type: "string" },
              level: {
                type: "integer",
                minimum: 1,
                maximum: 30,
              },
            },
            required: ["kind"],
          },
        },
        required: [
          "title",
          "intent",
          "mechanics",
          "coverage",
          "unsupported_requirements",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_mechanics_compilation",
      description:
        "Read one of the current GM's Mechanics Compiler artifacts, including normalized mechanics, coverage, diagnostics and target snapshot.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          compilation_id: { type: "string" },
        },
        required: ["compilation_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_mechanics_compilations",
      description:
        "List the current GM's recent Mechanics Compiler artifacts. Use this before resolving references like 'apply the last mechanics'.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_mechanics_compilation",
      description:
        "Apply one previously validated mechanics compilation to its exact existing campaign target. Use only after the GM explicitly asks to apply/save/connect it. Built-in class/subclass templates are rejected and require Developer Mode.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          compilation_id: { type: "string" },
        },
        required: ["compilation_id"],
      },
    },
  },
]

export function isVossMechanicsTool(name: string) {
  return TOOL_NAMES.has(name)
}

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function text(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function uuid(value: unknown) {
  const result = text(value, 80)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(result)
    ? result
    : ""
}

function integer(value: unknown, min: number, max: number, fallback: number) {
  const result = Number(value)
  return Number.isInteger(result) && result >= min && result <= max
    ? result
    : fallback
}

function uniqueStrings(value: unknown, limit = 32) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value.map((item) => text(item, 400)).filter(Boolean),
  )].slice(0, limit)
}

function normalizeCoverage(
  value: unknown,
  mechanicIds: Set<string>,
): {
  rows: CoverageRow[]
  diagnostics: MechanicsDiagnostic[]
} {
  const diagnostics: MechanicsDiagnostic[] = []
  const rows: CoverageRow[] = []
  const input = Array.isArray(value) ? value.slice(0, 32) : []

  if (!input.length) {
    diagnostics.push({
      severity: "error",
      code: "coverage_required",
      path: "coverage",
      message:
        "Every mechanics compilation must classify the rule boundary as CE, GM or hybrid.",
    })
    return { rows, diagnostics }
  }

  input.forEach((raw, index) => {
    const row = object(raw)
    const rule = text(row.rule, 1200)
    const owner = text(row.owner, 20) as CoverageOwner
    const mechanicIdsRaw = uniqueStrings(row.mechanic_ids, 32)
    const note = text(row.note, 1200)

    if (!rule || !["ce", "gm", "hybrid"].includes(owner)) {
      diagnostics.push({
        severity: "error",
        code: "coverage_row_invalid",
        path: "coverage[" + index + "]",
        message: "Coverage row requires rule text and owner ce|gm|hybrid.",
      })
      return
    }

    const missing = mechanicIdsRaw.filter((id) => !mechanicIds.has(id))
    if (missing.length) {
      diagnostics.push({
        severity: "error",
        code: "coverage_unknown_mechanic",
        path: "coverage[" + index + "].mechanic_ids",
        message: "Coverage references unknown mechanic ids: " + missing.join(", "),
      })
    }

    if ((owner === "ce" || owner === "hybrid") && !mechanicIdsRaw.length) {
      diagnostics.push({
        severity: "error",
        code: "coverage_missing_ce_mechanics",
        path: "coverage[" + index + "].mechanic_ids",
        message: "CE/hybrid coverage requires at least one executable mechanic id.",
      })
    }

    if (owner === "gm" && mechanicIdsRaw.length) {
      diagnostics.push({
        severity: "error",
        code: "gm_coverage_has_runtime_mechanics",
        path: "coverage[" + index + "].mechanic_ids",
        message:
          "GM-only adjudication must not be represented by executable mechanics or fake state.",
      })
    }

    rows.push({
      rule,
      owner,
      mechanic_ids: mechanicIdsRaw,
      note,
    })
  })

  const referenced = new Set(rows.flatMap((row) => row.mechanic_ids))
  const unreferenced = [...mechanicIds].filter((id) => !referenced.has(id))
  if (unreferenced.length) {
    diagnostics.push({
      severity: "warning",
      code: "mechanics_not_covered",
      path: "coverage",
      message:
        "Compiled mechanic ids are not referenced by coverage: " +
        unreferenced.join(", "),
    })
  }

  return { rows, diagnostics }
}

function contextTarget(viewContext: JsonRecord) {
  const entity = object(viewContext.entity)
  const id = uuid(entity.id)
  const type = text(entity.type, 80)

  if (!id) return null
  if (type === "definition" || type === "reference_definition") {
    return { kind: "reference_definition", id, level: null }
  }
  if (
    type === "class" ||
    type === "subclass" ||
    type === "race" ||
    type === "subrace" ||
    type === "rule_template"
  ) {
    return { kind: "rule_template", id, level: null }
  }
  return null
}

function requestedTarget(args: JsonRecord, viewContext: JsonRecord) {
  const raw = object(args.target)
  const kind = text(raw.kind, 40)
  const id = uuid(raw.id)
  const level = integer(raw.level, 1, 30, 0)

  if (!kind) return contextTarget(viewContext) || {
    kind: "preview",
    id: "",
    level: null,
  }

  if (kind === "preview") {
    return { kind, id: "", level: null }
  }

  return {
    kind,
    id,
    level: level || null,
  }
}

async function targetSnapshot(
  ctx: MechanicsToolContext,
  target: { kind: string; id: string; level: number | null },
) {
  if (target.kind === "preview") {
    return {
      targetKind: "preview",
      targetId: null,
      targetLevel: null,
      snapshot: {},
      targetMeta: { preview: true },
    }
  }

  if (!target.id) {
    return { error: "mechanics_target_id_required" }
  }

  if (target.kind === "reference_definition") {
    const { data: definition, error } = await ctx.userClient
      .from("reference_definitions")
      .select("id,campaign_id,scope,kind,slug,status,current_revision")
      .eq("id", target.id)
      .maybeSingle()

    if (error) return { error: error.message }
    if (
      !definition ||
      definition.scope !== "campaign" ||
      definition.campaign_id !== ctx.campaignId
    ) {
      return { error: "mechanics_target_not_found_or_immutable" }
    }

    const { data: revision, error: revisionError } = await ctx.userClient
      .from("reference_definition_revisions")
      .select("mechanics")
      .eq("definition_id", definition.id)
      .eq("revision", definition.current_revision)
      .maybeSingle()

    if (revisionError) return { error: revisionError.message }
    if (!revision) return { error: "mechanics_target_revision_missing" }

    return {
      targetKind: "reference_definition",
      targetId: definition.id,
      targetLevel: null,
      snapshot: {
        current_revision: definition.current_revision,
        mechanics: revision.mechanics || [],
      },
      targetMeta: {
        kind: definition.kind,
        slug: definition.slug,
        status: definition.status,
        current_revision: definition.current_revision,
        builtin: false,
      },
    }
  }

  if (target.kind === "rule_template") {
    const { data: template, error } = await ctx.userClient
      .from("rule_templates")
      .select("id,campaign_id,kind,slug,name,version,is_builtin,mechanics,updated_at")
      .eq("id", target.id)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!template || template.campaign_id !== ctx.campaignId) {
      return { error: "mechanics_target_not_found" }
    }

    return {
      targetKind: "rule_template",
      targetId: template.id,
      targetLevel: null,
      snapshot: {
        mechanics: template.mechanics || [],
        updated_at: template.updated_at,
      },
      targetMeta: {
        kind: template.kind,
        slug: template.slug,
        name: template.name,
        version: template.version,
        builtin: template.is_builtin === true,
      },
    }
  }

  if (target.kind === "rule_template_level") {
    if (!target.level) return { error: "mechanics_target_level_required" }

    const { data: template, error } = await ctx.userClient
      .from("rule_templates")
      .select("id,campaign_id,kind,slug,name,version,is_builtin")
      .eq("id", target.id)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!template || template.campaign_id !== ctx.campaignId) {
      return { error: "mechanics_target_not_found" }
    }

    const { data: levelRow, error: levelError } = await ctx.userClient
      .from("rule_template_levels")
      .select("id,template_id,level,mechanics")
      .eq("template_id", template.id)
      .eq("level", target.level)
      .maybeSingle()

    if (levelError) return { error: levelError.message }
    if (!levelRow) return { error: "mechanics_target_level_not_found" }

    return {
      targetKind: "rule_template_level",
      targetId: levelRow.id,
      targetLevel: levelRow.level,
      snapshot: {
        template_id: template.id,
        level: levelRow.level,
        mechanics: levelRow.mechanics || [],
      },
      targetMeta: {
        kind: template.kind,
        slug: template.slug,
        name: template.name,
        version: template.version,
        level: levelRow.level,
        builtin: template.is_builtin === true,
      },
    }
  }

  return { error: "mechanics_target_kind_unsupported" }
}

async function validateSpellCatalog(
  ctx: MechanicsToolContext,
  mechanics: JsonRecord[],
) {
  const slugs = [...new Set(
    mechanics
      .filter((mechanic) => mechanic.type === "spell")
      .map((mechanic) => text(mechanic.catalogSlug, 180))
      .filter(Boolean),
  )]

  if (!slugs.length) return [] as MechanicsDiagnostic[]

  const { data, error } = await ctx.userClient
    .from("spell_catalog")
    .select("slug")
    .in("slug", slugs)

  if (error) {
    return [{
      severity: "error",
      code: "spell_catalog_lookup_failed",
      path: "mechanics",
      message: error.message,
    }] satisfies MechanicsDiagnostic[]
  }

  const found = new Set((data || []).map((row: any) => String(row.slug)))
  return slugs
    .filter((slug) => !found.has(slug))
    .map((slug) => ({
      severity: "error" as const,
      code: "spell_catalog_missing",
      path: "mechanics",
      message: "Spell catalog does not contain slug: " + slug,
    }))
}

async function compileMechanics(
  ctx: MechanicsToolContext,
  args: JsonRecord,
) {
  if (!ctx.canManage) return { error: "gm_authority_required" }

  const title = text(args.title, 180)
  const intent = text(args.intent, 6000)
  if (!title || !intent) {
    return { error: "mechanics_title_and_intent_required" }
  }

  const compiled = compileStoredMechanics(args.mechanics)
  const mechanicIds = new Set(
    compiled.mechanics.map((mechanic) => String(mechanic.id || "")),
  )
  const coverage = normalizeCoverage(args.coverage, mechanicIds)
  const unsupported = uniqueStrings(args.unsupported_requirements, 20)

  const target = requestedTarget(args, ctx.viewContext)
  const targetResult = await targetSnapshot(ctx, target)
  if ("error" in targetResult) return targetResult

  const spellDiagnostics = await validateSpellCatalog(ctx, compiled.mechanics)
  const diagnostics = [
    ...compiled.diagnostics,
    ...coverage.diagnostics,
    ...spellDiagnostics,
  ]

  if (targetResult.targetMeta?.builtin === true) {
    diagnostics.push({
      severity: "info",
      code: "builtin_preview_only",
      path: "target",
      message:
        "Built-in class/subclass mechanics may be previewed here, but runtime apply is forbidden. Changes require Developer Mode and package tests.",
    })
  }

  const hasErrors = diagnostics.some((item) => item.severity === "error")
  const status = hasErrors || unsupported.length
    ? "unsupported"
    : "validated"

  const { data: job, error: jobError } = await ctx.admin
    .from("agent_jobs")
    .insert({
      campaign_id: ctx.campaignId,
      thread_id: ctx.threadId,
      requested_by: ctx.userId,
      agent_key: "voss",
      job_type: "mechanics_compile",
      status: status === "validated" ? "completed" : "failed",
      input: {
        title,
        intent,
        target: {
          kind: targetResult.targetKind,
          id: targetResult.targetId,
          level: targetResult.targetLevel,
        },
      },
      result: {
        compiler_version: MECHANICS_COMPILER_VERSION,
        status,
        diagnostics,
        unsupported_reasons: unsupported,
      },
      requested_outputs: 1,
      completed_outputs: status === "validated" ? 1 : 0,
      error_code: status === "validated" ? null : "mechanics_compile_unsupported",
      error_message:
        status === "validated"
          ? null
          : unsupported[0] || diagnostics.find((item) => item.severity === "error")?.message || "Mechanics are not safely compilable.",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (jobError || !job?.id) {
    return { error: jobError?.message || "mechanics_compile_job_failed" }
  }

  const { data: artifact, error: artifactError } = await ctx.admin
    .from("ai_mechanics_compilations")
    .insert({
      campaign_id: ctx.campaignId,
      thread_id: ctx.threadId,
      agent_job_id: job.id,
      created_by: ctx.userId,
      title,
      intent_text: intent,
      target_kind: targetResult.targetKind,
      target_id: targetResult.targetId,
      target_level: targetResult.targetLevel,
      target_snapshot: targetResult.snapshot,
      status,
      mechanics: compiled.mechanics,
      coverage: coverage.rows,
      diagnostics,
      unsupported_reasons: unsupported,
      compiler_version: MECHANICS_COMPILER_VERSION,
    })
    .select("id,status,title,target_kind,target_id,target_level,mechanics,coverage,diagnostics,unsupported_reasons,compiler_version,created_at")
    .single()

  if (artifactError || !artifact) {
    await ctx.admin
      .from("agent_jobs")
      .update({
        status: "failed",
        completed_outputs: 0,
        error_code: "mechanics_artifact_insert_failed",
        error_message: artifactError?.message || "Could not save mechanics compilation.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    return {
      error:
        artifactError?.message ||
        "mechanics_artifact_insert_failed",
    }
  }

  return {
    compilation: artifact,
    target: targetResult.targetMeta,
    canonical_state_changed: false,
    needs_developer_mode:
      unsupported.length > 0 ||
      hasErrors ||
      targetResult.targetMeta?.builtin === true,
    next_step:
      status === "validated"
        ? targetResult.targetKind === "preview"
          ? "Compilation is valid as a preview. Choose an explicit campaign target before applying."
          : targetResult.targetMeta?.builtin === true
            ? "Compilation is a valid preview, but the built-in package can only be changed through Developer Mode with code/tests."
            : "Compilation is validated but not applied. Apply only after the GM explicitly confirms."
        : "Do not apply. Resolve diagnostics or use Developer Mode for genuinely missing reusable runtime capabilities.",
  }
}

async function readCompilation(
  ctx: MechanicsToolContext,
  args: JsonRecord,
) {
  if (!ctx.canManage) return { error: "gm_authority_required" }
  const id = uuid(args.compilation_id)
  if (!id) return { error: "compilation_id_required" }

  const { data, error } = await ctx.userClient
    .from("ai_mechanics_compilations")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return {
    compilation: data,
    canonical_state_changed: data.status === "applied",
  }
}

async function recentCompilations(
  ctx: MechanicsToolContext,
  args: JsonRecord,
) {
  if (!ctx.canManage) return { error: "gm_authority_required" }
  const limit = integer(args.limit, 1, 10, 5)

  const { data, error } = await ctx.userClient
    .from("ai_mechanics_compilations")
    .select("id,title,intent_text,target_kind,target_id,target_level,status,diagnostics,unsupported_reasons,compiler_version,applied_at,applied_result,created_at,updated_at")
    .eq("campaign_id", ctx.campaignId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return { error: error.message }
  return { compilations: data || [] }
}

async function applyCompilation(
  ctx: MechanicsToolContext,
  args: JsonRecord,
) {
  if (!ctx.canManage) return { error: "gm_authority_required" }
  const id = uuid(args.compilation_id)
  if (!id) return { error: "compilation_id_required" }

  const { data, error } = await ctx.admin.rpc(
    "apply_ai_mechanics_compilation_v1",
    {
      p_compilation_id: id,
      p_user_id: ctx.userId,
    },
  )

  if (error) {
    const message = error.message || "mechanics_apply_failed"
    if (/builtin_template_requires_developer_mode/i.test(message)) {
      return {
        error: "builtin_template_requires_developer_mode",
        needs_developer_mode: true,
        canonical_state_changed: false,
      }
    }
    if (/mechanics_target_conflict/i.test(message)) {
      return {
        error: "mechanics_target_conflict",
        instruction:
          "The target mechanics changed after compilation. Compile again against the fresh target.",
        canonical_state_changed: false,
      }
    }
    return {
      error: message,
      canonical_state_changed: false,
    }
  }

  return {
    applied: true,
    compilation_id: id,
    result: data,
    canonical_state_changed: true,
  }
}

export async function executeVossMechanicsTool(
  ctx: MechanicsToolContext,
  name: string,
  args: JsonRecord,
) {
  if (name === "compile_mechanics") {
    return compileMechanics(ctx, args)
  }
  if (name === "read_mechanics_compilation") {
    return readCompilation(ctx, args)
  }
  if (name === "list_recent_mechanics_compilations") {
    return recentCompilations(ctx, args)
  }
  if (name === "apply_mechanics_compilation") {
    return applyCompilation(ctx, args)
  }
  return { error: "unknown_mechanics_tool" }
}
