import type { ResolvedCharacterContract } from "./contract.ts"
import type { GrantPayload, ResolvedAction } from "./types.ts"

export type D20TestKind = "ability" | "skill" | "tool" | "save" | "attack"

export type D20TestContext = {
  kind: D20TestKind
  key?: string
  proficiencyRank?: number
  proficient?: boolean
}

export type ResolvedD20Floor = {
  minimum: number
  ruleKeys: string[]
}

function asRecord(value: GrantPayload): Record<string, GrantPayload> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, GrantPayload>
}

function asStringArray(value: GrantPayload | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

/**
 * Generic deterministic d20-floor resolver.
 *
 * This intentionally consumes structured CE rules instead of class names. Any
 * class/feat/item may publish a d20_minimum mechanic and receive the same
 * behavior. Server-side roll generation still owns the actual die roll.
 */
export function resolveD20Floor(
  contract: ResolvedCharacterContract,
  context: D20TestContext,
): ResolvedD20Floor | null {
  const proficient =
    context.proficient ??
    (typeof context.proficiencyRank === "number" && context.proficiencyRank > 0)

  let minimum = 1
  const ruleKeys: string[] = []

  for (const rule of contract.rules) {
    if (rule.integration !== "structured") continue
    const mechanic = asRecord(rule.mechanic)
    if (!mechanic || mechanic.kind !== "d20_minimum") continue

    const value = mechanic.minimum
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 20
    ) {
      continue
    }

    const testKinds = asStringArray(mechanic.testKinds)
    if (testKinds.length && !testKinds.includes(context.kind)) continue

    const keys = asStringArray(mechanic.keys)
    if (keys.length && (!context.key || !keys.includes(context.key))) continue

    if (mechanic.requiresProficiency === true && !proficient) continue

    if (value > minimum) {
      minimum = value
      ruleKeys.length = 0
      ruleKeys.push(rule.key)
    } else if (value === minimum && value > 1) {
      ruleKeys.push(rule.key)
    }
  }

  return minimum > 1
    ? { minimum, ruleKeys: [...new Set(ruleKeys)] }
    : null
}


export type ResolvedD20ResultOverride = {
  result: number
  trigger?: string
  adjudication?: string
}

/**
 * Reads an explicit d20-result override from any resolved action. The action is
 * still responsible for costs and requirements; this helper only exposes the
 * semantic consequence to renderers/adapters.
 */
export function resolveD20ResultOverride(
  action: Pick<ResolvedAction, "effects">,
): ResolvedD20ResultOverride | null {
  for (const effect of action.effects) {
    if (effect.kind !== "semantic" || effect.key !== "d20_result_override") continue
    const payload = effect.payload
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue

    const result = payload.result
    if (
      typeof result !== "number" ||
      !Number.isInteger(result) ||
      result < 1 ||
      result > 20
    ) {
      continue
    }

    return {
      result,
      ...(typeof payload.trigger === "string" && payload.trigger.trim()
        ? { trigger: payload.trigger.trim() }
        : {}),
      ...(typeof payload.adjudication === "string" && payload.adjudication.trim()
        ? { adjudication: payload.adjudication.trim() }
        : {}),
    }
  }
  return null
}
