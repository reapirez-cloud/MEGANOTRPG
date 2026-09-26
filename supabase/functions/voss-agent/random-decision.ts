import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

type JsonRecord = Record<string, unknown>

export type RandomDecisionSurface = "background_flash" | "primary_gm"

export type RandomDecisionContext = {
  admin: SupabaseClient
  campaignId: string
  campaignDay: number
  runKey: string
  // Primary GM authorization uses the running agent_jobs UUID; runKey is the
  // narrative identity and may be a source/day string.
  jobId?: string
  surface: RandomDecisionSurface
  sourceMessageId?: string
  sourceCharacterId?: string
  sourceLocationId?: string | null
  knownLocationIds?: string[]
  knownNpcIds?: string[]
  knownMemoryFactIds?: string[]
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
        decision_kind: {
          type: "string",
          enum: ["generic", "world_discovery"],
          description:
            "Use world_discovery only when deciding whether a previously-unestablished searched-for thing/place/creature/valuable exists in the current world area. Presence/state of an already-known entity is generic.",
        },
        claim_basis: {
          type: "string",
          enum: [
            "canonical_context",
            "gm_generated",
            "player_specific_claim",
            "generic_search",
          ],
          description:
            "Where the uncertainty came from. A specific target named only by the player's message is player_specific_claim, never gm_generated.",
        },
        canonical_evidence_ids: {
          type: "array",
          maxItems: 16,
          items: { type: "string" },
          description:
            "Canonical known location/NPC/memory-fact ids that justify a specific player target. Use [] when none exist.",
        },
        rarity_class: {
          type: "string",
          enum: ["mundane", "uncommon", "rare", "exceptional", "legendary"],
          description:
            "Required for world_discovery. Choose from world context, never from the player's desire or GM behavior profile.",
        },
        search_category: {
          type: "string",
          enum: [
            "valuables",
            "supplies",
            "tracks",
            "hidden_places",
            "creatures",
            "other",
          ],
          description:
            "Required for world_discovery. Stable category for the same area/day so repeated searches reuse one committed discovery pool.",
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
              target_present: {
                type: "boolean",
                description:
                  "Required for world_discovery. True only when this band establishes the searched-for target/category as present in the area.",
              },
              payload: { type: "object", additionalProperties: true },
            },
            required: ["key", "description", "min", "max"],
          },
        },
      },
      required: [
        "decision_key",
        "decision_kind",
        "claim_basis",
        "canonical_evidence_ids",
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
      ...(typeof row.target_present === "boolean"
        ? { target_present: row.target_present }
        : {}),
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

const DISCOVERY_MAX_PRESENT_PERCENT = {
  mundane: 65,
  uncommon: 25,
  rare: 8,
  exceptional: 2,
  legendary: 1,
} as const

function stringList(value: unknown, limit = 16) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, limit)
    : []
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
  const decisionKind = text(args.decision_kind, 40).toLowerCase()
  const claimBasis = text(args.claim_basis, 64).toLowerCase()
  const rarityClass = text(args.rarity_class, 40).toLowerCase()
  const searchCategory = text(args.search_category, 64).toLowerCase()
  const canonicalEvidenceIds = stringList(args.canonical_evidence_ids)

  if (!["generic", "world_discovery"].includes(decisionKind)) {
    throw new Error("random_decision_kind_invalid")
  }
  if (
    ![
      "canonical_context",
      "gm_generated",
      "player_specific_claim",
      "generic_search",
    ].includes(claimBasis)
  ) {
    throw new Error("random_decision_claim_basis_invalid")
  }
  if (!question) throw new Error("random_decision_question_required")
  if (!reason) throw new Error("random_decision_reason_required")
  if (!["world", "npc", "location", "scene_actor"].includes(targetScope)) {
    throw new Error("random_decision_target_scope_invalid")
  }
  if (!targetId) throw new Error("random_decision_target_id_required")
  if (!Number.isInteger(context.campaignDay) || context.campaignDay < 1) {
    throw new Error("random_decision_campaign_day_invalid")
  }

  const knownEvidence = new Set([
    ...(context.knownLocationIds || []),
    ...(context.knownNpcIds || []),
    ...(context.knownMemoryFactIds || []),
  ])

  if (
    context.surface === "primary_gm" &&
    claimBasis === "player_specific_claim" &&
    !canonicalEvidenceIds.some((id) => knownEvidence.has(id))
  ) {
    throw new Error("random_decision_player_specific_claim_unknown")
  }

  let decisionRunKey = context.runKey
  let decisionLocalKey = localKey

  if (decisionKind === "world_discovery") {
    if (
      !["mundane", "uncommon", "rare", "exceptional", "legendary"].includes(
        rarityClass,
      )
    ) {
      throw new Error("random_decision_discovery_rarity_required")
    }
    if (
      ![
        "valuables",
        "supplies",
        "tracks",
        "hidden_places",
        "creatures",
        "other",
      ].includes(searchCategory)
    ) {
      throw new Error("random_decision_search_category_required")
    }

    if (context.surface === "primary_gm") {
      decisionRunKey = [
        "day",
        String(context.campaignDay),
        targetScope,
        targetId,
        searchCategory,
      ].join(":")
      decisionLocalKey = "discovery_pool"
    }
  }

  const decisionKey = fullDecisionKey(
    context.surface,
    decisionRunKey,
    decisionLocalKey,
  )
  const authorizedRunKey = context.surface === "primary_gm"
    ? context.jobId
    : context.runKey
  if (!authorizedRunKey) throw new Error("random_decision_job_id_required")

  // A previous search of this category already fixed its odds and d100 result.
  // Read it before checking the model's new proposal, which may use different
  // wording or invalid odds and must never change the existing pool.
  let existingPool: JsonRecord = {}
  if (decisionKind === "world_discovery" && context.surface === "primary_gm") {
    const lookup = await context.admin.rpc("lookup_ai_gm_discovery_pool_v1", {
      p_campaign_id: context.campaignId,
      p_job_id: context.jobId,
      p_decision_key: decisionKey,
      p_campaign_day: context.campaignDay,
      p_target_scope: targetScope,
      p_target_id: targetId,
    })
    if (lookup.error) throw new Error(lookup.error.message)
    existingPool = record(lookup.data)
  }

  const outcomeBands = existingPool.commit_id ? [] : cleanBands(args.outcome_bands)
  if (decisionKind === "world_discovery" && !existingPool.commit_id) {
    const presenceFlags = outcomeBands.map((band) =>
      (band as JsonRecord).target_present
    )
    if (presenceFlags.some((value) => typeof value !== "boolean")) {
      throw new Error("random_decision_discovery_presence_flags_required")
    }
    for (const band of outcomeBands) {
      const row = band as JsonRecord
      const worldExistence = text(record(row.payload).stage17_world_existence, 16).toLowerCase()
      if (worldExistence !== "exists" && worldExistence !== "absent") {
        throw new Error("random_decision_discovery_world_existence_required")
      }
      if (
        (row.target_present === true && worldExistence !== "exists") ||
        (row.target_present === false && worldExistence !== "absent")
      ) {
        throw new Error("random_decision_discovery_world_existence_mismatch")
      }
    }
    const presentPercent = outcomeBands.reduce((total, band) => {
      const row = band as JsonRecord
      return row.target_present === true
        ? total + Number(row.max) - Number(row.min) + 1
        : total
    }, 0)
    const maxPresent = DISCOVERY_MAX_PRESENT_PERCENT[
      rarityClass as keyof typeof DISCOVERY_MAX_PRESENT_PERCENT
    ]
    if (presentPercent > maxPresent) {
      throw new Error("random_decision_discovery_probability_too_high")
    }
  }

  // Stage 11 protocol is intentionally two RPCs.
  // The first transaction durably commits the question and all outcome bands.
  // Only after it succeeds may the second transaction generate/return a roll.
  const committed = existingPool.commit_id ? null : await context.admin.rpc("commit_random_decision_v1", {
    p_campaign_id: context.campaignId,
    p_decision_key: decisionKey,
    p_question: question,
    p_bands: outcomeBands,
    p_campaign_day: context.campaignDay,
    p_run_key: authorizedRunKey,
    p_target_scope: targetScope,
    p_target_id: targetId,
    p_caller_surface: context.surface,
    p_reason: reason,
  })
  if (committed?.error) throw new Error(committed.error.message)

  const commit = committed ? record(committed.data) : existingPool
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

  if (context.surface === "primary_gm") {
    const published = await context.admin.rpc("publish_ai_gm_random_decision_v1", {
      p_job_id: context.jobId,
      p_commit_id: commitId,
    })
    if (published.error) throw new Error(published.error.message)
  }

  return {
    decision_key: decisionKey,
    question: text(resolution.question, 1600) || question,
    roll: receipt.result,
    matched_outcome_key: receipt.matched_outcome_key,
    matched_outcome: matched,
    outcome_bands: resolution.outcome_bands,
    decision_kind: decisionKind,
    claim_basis: claimBasis,
    rarity_class: decisionKind === "world_discovery" ? rarityClass : null,
    search_category: decisionKind === "world_discovery" ? searchCategory : null,
    canonical_evidence_ids: canonicalEvidenceIds,
    commit_replayed: Boolean(existingPool.commit_id) || commit.replayed === true,
    roll_replayed: resolution.replayed === true,
    instruction:
      "Follow matched_outcome exactly. Do not reroll, remap bands or replace the decided branch.",
  }
}
