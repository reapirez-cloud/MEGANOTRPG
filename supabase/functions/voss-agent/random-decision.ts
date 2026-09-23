import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

type JsonRecord = Record<string, unknown>

export type RandomDecisionSurface = "background_flash" | "primary_gm"

export type RandomDecisionContext = {
  admin: SupabaseClient
  campaignId: string
  campaignDay: number
  runKey: string
  surface: RandomDecisionSurface
}

export const RESOLVE_RANDOM_DECISION_TOOL = {
  type: "function",
  function: {
    name: "resolve_random_decision",
    description:
      "Use ONLY for a genuinely unresolved narrative/world branch with 2+ plausible outcomes that is not already determined by rules, a player/NPC check, a supplied roll, canonical state or deterministic logic. You MUST define the full d100 outcome mapping before the server rolls. The server commits question+bounds first, then rolls, persists the decision_key, and never rerolls it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        decision_key: {
          type: "string",
          description:
            "Short stable local key for this exact uncertainty inside the current GM turn/day run, e.g. patrol_arrives or merchant_recovers. Reusing it with different semantics is rejected.",
        },
        question: {
          type: "string",
          description:
            "The exact unresolved factual question. It must not already have a canonical/mechanical answer.",
        },
        reason: {
          type: "string",
          description:
            "Why this is genuinely unresolved and requires narrative randomness instead of deterministic rules or an existing roll.",
        },
        target_scope: {
          type: "string",
          enum: ["world", "npc", "location", "scene_actor"],
        },
        target_id: {
          type: "string",
          description:
            "Canonical UUID for npc/location/scene_actor, or campaign UUID when target_scope=world. Never invent an id.",
        },
        outcome_bands: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          description:
            "Ordered, gapless, non-overlapping d100 bands covering 1..100. Each description must state the concrete outcome BEFORE the roll exists.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              key: { type: "string" },
              label: { type: "string" },
              description: { type: "string" },
              min: { type: "integer", minimum: 1, maximum: 100 },
              max: { type: "integer", minimum: 1, maximum: 100 },
              payload: { type: "object", additionalProperties: true },
            },
            required: ["key", "description", "min", "max"],
          },
        },
      },
      required: [
        "decision_key",
        "question",
        "reason",
        "target_scope",
        "target_id",
        "outcome_bands",
      ],
    },
  },
} as const

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function localDecisionKey(value: unknown) {
  const raw = text(value, 80).toLowerCase()
  const cleaned = raw
    .replace(/[^a-z0-9._:-]+/g, "_")
    .replace(/^[_:.\-]+|[_:.\-]+$/g, "")
    .slice(0, 64)
  if (!cleaned || !/^[a-z0-9][a-z0-9._:-]*$/.test(cleaned)) {
    throw new Error("random_decision_key_invalid")
  }
  return cleaned
}

function cleanBands(value: unknown) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
    throw new Error("random_decision_band_count_invalid")
  }

  let expectedMin = 1
  const keys = new Set<string>()
  const result = value.map((entry) => {
    const row = record(entry)
    const key = text(row.key, 120).toLowerCase()
    const description = text(row.description, 1200)
    const label = text(row.label, 240)
    const min = Number(row.min)
    const max = Number(row.max)

    if (
      !/^[a-z0-9][a-z0-9._:-]*$/.test(key) ||
      keys.has(key) ||
      !description ||
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min !== expectedMin ||
      max < min ||
      max > 100
    ) {
      throw new Error("random_decision_bands_invalid")
    }

    keys.add(key)
    expectedMin = max + 1

    return {
      key,
      ...(label ? { label } : {}),
      description,
      min,
      max,
      ...(row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? { payload: row.payload as JsonRecord }
        : {}),
    }
  })

  if (expectedMin !== 101) {
    throw new Error("random_decision_bands_must_cover_d100")
  }

  return result
}

function fullDecisionKey(
  surface: RandomDecisionSurface,
  runKey: string,
  localKey: string,
) {
  const run = runKey.toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").slice(0, 80)
  const key = `narrative:${surface}:${run}:${localKey}`
  if (key.length > 240) throw new Error("random_decision_key_too_long")
  return key
}

export async function executeRandomDecision(
  context: RandomDecisionContext,
  args: JsonRecord,
) {
  const localKey = localDecisionKey(args.decision_key)
  const question = text(args.question, 1600)
  const reason = text(args.reason, 1200)
  const targetScope = text(args.target_scope, 32).toLowerCase()
  const targetId = text(args.target_id, 240)
  const outcomeBands = cleanBands(args.outcome_bands)

  if (!question) throw new Error("random_decision_question_required")
  if (!reason) throw new Error("random_decision_reason_required")
  if (!["world", "npc", "location", "scene_actor"].includes(targetScope)) {
    throw new Error("random_decision_target_scope_invalid")
  }
  if (!targetId) throw new Error("random_decision_target_id_required")
  if (!Number.isInteger(context.campaignDay) || context.campaignDay < 1) {
    throw new Error("random_decision_campaign_day_invalid")
  }

  const decisionKey = fullDecisionKey(
    context.surface,
    context.runKey,
    localKey,
  )

  // Stage 11 protocol is intentionally two RPCs.
  // The first transaction durably commits the question and all outcome bands.
  // Only after it succeeds may the second transaction generate/return a roll.
  const committed = await context.admin.rpc("commit_random_decision_v1", {
    p_campaign_id: context.campaignId,
    p_decision_key: decisionKey,
    p_question: question,
    p_bands: outcomeBands,
    p_campaign_day: context.campaignDay,
    p_run_key: context.runKey,
    p_target_scope: targetScope,
    p_target_id: targetId,
    p_caller_surface: context.surface,
    p_reason: reason,
  })
  if (committed.error) throw new Error(committed.error.message)

  const commit = record(committed.data)
  const commitId = text(commit.commit_id, 100)
  if (!commitId) throw new Error("random_decision_commit_id_missing")

  const resolved = await context.admin.rpc(
    "resolve_committed_random_decision_v1",
    { p_commit_id: commitId },
  )
  if (resolved.error) throw new Error(resolved.error.message)

  const resolution = record(resolved.data)
  const receipt = record(resolution.receipt)
  const matched = record(receipt.matched_outcome)

  return {
    decision_key: decisionKey,
    question,
    roll: receipt.result,
    matched_outcome_key: receipt.matched_outcome_key,
    matched_outcome: matched,
    outcome_bands: resolution.outcome_bands,
    commit_replayed: commit.replayed === true,
    roll_replayed: resolution.replayed === true,
    instruction:
      "Follow matched_outcome exactly. Do not reroll, remap bands or replace the decided branch.",
  }
}
