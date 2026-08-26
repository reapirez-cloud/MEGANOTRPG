import { evaluateCondition } from "./conditions.ts"
import type {
  AbilityKey,
  CharacterContribution,
  CharacterState,
  GrantContribution,
  GrantPayload,
  GrantTarget,
  ProficiencyRank,
  ResolvedGrant,
  ResolvedSourceRef,
  SenseGrantPayload,
  SkillKey,
} from "./types.ts"

export class GrantEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GrantEngineError"
  }
}

export class GrantConflictError extends GrantEngineError {
  constructor(message: string) {
    super(message)
    this.name = "GrantConflictError"
  }
}

function compareContributionOrder(
  left: Pick<CharacterContribution, "id" | "priority">,
  right: Pick<CharacterContribution, "id" | "priority">,
) {
  return (left.priority ?? 0) - (right.priority ?? 0) || left.id.localeCompare(right.id)
}

function canonicalPayload(value: GrantPayload | undefined): string {
  if (value === undefined) return "undefined"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalPayload).join(",")}]`

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalPayload(value[key])}`)
    .join(",")}}`
}

function proficiencyRankFromPayload(payload: GrantPayload | undefined): 1 | 2 {
  if (payload === undefined) return 1
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    (payload.rank === 1 || payload.rank === 2)
  ) {
    return payload.rank
  }
  throw new GrantEngineError("proficiency grant payload must be { rank: 1 | 2 }")
}

function sensePayload(payload: GrantPayload | undefined): SenseGrantPayload {
  if (payload === undefined) return {}
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new GrantEngineError("sense grant payload must be an object")
  }

  const range = payload.range
  const unit = payload.unit
  if (range !== undefined && (typeof range !== "number" || !Number.isFinite(range) || range < 0)) {
    throw new GrantEngineError("sense range must be a finite number >= 0")
  }
  if (unit !== undefined && typeof unit !== "string") {
    throw new GrantEngineError("sense unit must be a string")
  }
  return {
    ...(range === undefined ? {} : { range }),
    ...(unit === undefined ? {} : { unit }),
  }
}

function mergePayload(
  target: GrantTarget,
  current: GrantPayload | undefined,
  incoming: GrantPayload | undefined,
  identity: string,
): GrantPayload | undefined {
  if (target === "proficiency") {
    const rank = Math.max(
      proficiencyRankFromPayload(current),
      proficiencyRankFromPayload(incoming),
    ) as 1 | 2
    return { rank }
  }

  if (target === "sense") {
    const left = sensePayload(current)
    const right = sensePayload(incoming)
    if (left.unit && right.unit && left.unit !== right.unit) {
      throw new GrantConflictError(`conflicting sense units for ${identity}`)
    }
    const ranges = [left.range, right.range].filter((value): value is number => value !== undefined)
    return {
      ...(ranges.length === 0 ? {} : { range: Math.max(...ranges) }),
      ...(left.unit ?? right.unit ? { unit: left.unit ?? right.unit } : {}),
    }
  }

  if (canonicalPayload(current) !== canonicalPayload(incoming)) {
    throw new GrantConflictError(
      `conflicting payloads for ${identity}; use a distinct variantKey for mechanically different grants`,
    )
  }
  return current
}

export function skillProficiencyKey(skill: SkillKey): string {
  return `skill:${skill}`
}

export function savingThrowProficiencyKey(ability: AbilityKey): string {
  return `savingThrow:${ability}`
}

export interface ResolvedProficiencyRank {
  rank: ProficiencyRank
  sources: ResolvedSourceRef[]
}

export function resolveProficiencyRank(
  baseRank: ProficiencyRank | undefined,
  grants: ResolvedGrant[],
  key: string,
): ResolvedProficiencyRank {
  const matching = grants.filter(
    (grant) => grant.target === "proficiency" && grant.key === key && grant.variantKey === "default",
  )

  let rank: ProficiencyRank = baseRank ?? 0
  const sources: ResolvedSourceRef[] = []
  for (const grant of matching) {
    rank = Math.max(rank, proficiencyRankFromPayload(grant.payload)) as ProficiencyRank
    sources.push(...grant.sources)
  }
  return { rank, sources }
}

/**
 * Resolves set-like character facts. Equal identities merge provenance.
 * Mechanically different payloads must be represented as different variants,
 * except for domains with natural monotonic strength (proficiency rank and sense range).
 *
 * SUPPRESS remains supported for compatibility; its full semantics are formalized in step 7.
 */
export function resolveGrants(
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHp: number,
): ResolvedGrant[] {
  const active = contributions
    .filter(
      (contribution): contribution is GrantContribution =>
        contribution.kind === "grant" &&
        evaluateCondition(contribution.condition, { state, maxHp }),
    )
    .sort(compareContributionOrder)

  const groups = new Map<string, ResolvedGrant>()

  for (const contribution of active) {
    const variantKey = contribution.variantKey ?? "default"
    const identity = `${contribution.target}:${contribution.key}:${variantKey}`
    const current = groups.get(identity)

    if (contribution.operation === "SUPPRESS") {
      groups.delete(identity)
      continue
    }

    if (!current) {
      const payload =
        contribution.target === "proficiency"
          ? ({ rank: proficiencyRankFromPayload(contribution.payload) } as GrantPayload)
          : contribution.target === "sense"
            ? (sensePayload(contribution.payload) as GrantPayload)
            : contribution.payload

      groups.set(identity, {
        target: contribution.target,
        key: contribution.key,
        variantKey,
        ...(payload === undefined ? {} : { payload }),
        sources: [{ contributionId: contribution.id, source: contribution.source }],
      })
      continue
    }

    current.payload = mergePayload(
      contribution.target,
      current.payload,
      contribution.payload,
      identity,
    )
    current.sources.push({ contributionId: contribution.id, source: contribution.source })
  }

  return [...groups.values()].sort(
    (left, right) =>
      left.target.localeCompare(right.target) ||
      left.key.localeCompare(right.key) ||
      left.variantKey.localeCompare(right.variantKey),
  )
}
