import type {
  MechanicalData,
  ResolvedAction,
  ResolvedValue,
} from "./types.ts"

export const BONUS_DAMAGE_DICE_SACRIFICE_EFFECT =
  "bonus_damage_dice_sacrifice" as const

export type ResolvedBonusDamageDiceSacrifice = {
  poolValueKey: string
  diceCost: number
  dieSides: number
  poolDice: number
  remainingDice: number
  label?: string
}

function asRecord(
  value: MechanicalData | undefined,
): Record<string, MechanicalData> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, MechanicalData>
}

function positiveInteger(value: MechanicalData | undefined): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : null
}

/**
 * Generic semantic bridge for rules that trade some dice from an already
 * resolved bonus-damage pool for a rider effect.
 *
 * CE does not pretend the dice are a persistent resource. The pool is a named
 * scalar value, while scene legality remains owned by the action's rule text.
 */
export function resolveBonusDamageDiceSacrifice(
  action: Pick<ResolvedAction, "effects">,
  values: readonly ResolvedValue[],
): ResolvedBonusDamageDiceSacrifice | null {
  const effects = action.effects.filter(
    (effect) =>
      effect.kind === "semantic" &&
      effect.key === BONUS_DAMAGE_DICE_SACRIFICE_EFFECT,
  )
  if (!effects.length) return null

  let poolValueKey = ""
  let diceCost = 0
  let dieSides = 0
  let label: string | undefined

  for (const effect of effects) {
    if (effect.kind !== "semantic") continue
    const payload = asRecord(effect.payload)
    if (!payload) continue

    const nextPool =
      typeof payload.poolValueKey === "string"
        ? payload.poolValueKey.trim()
        : ""
    const nextCost = positiveInteger(payload.diceCost)
    const nextSides = positiveInteger(payload.dieSides)

    if (!nextPool || !nextCost || !nextSides) continue
    if (poolValueKey && poolValueKey !== nextPool) {
      throw new Error(
        "bonus-damage dice sacrifice effects must use one pool value",
      )
    }
    if (dieSides && dieSides !== nextSides) {
      throw new Error(
        "bonus-damage dice sacrifice effects must use one die size",
      )
    }

    poolValueKey = nextPool
    dieSides = nextSides
    diceCost += nextCost

    if (!label && typeof payload.label === "string" && payload.label.trim()) {
      label = payload.label.trim()
    }
  }

  if (!poolValueKey || !diceCost || !dieSides) return null

  const pool = values.find(
    (value) =>
      value.key === poolValueKey &&
      value.variantKey === "default",
  )
  const poolDice = Math.max(0, Math.floor(pool?.value.value ?? 0))

  return {
    poolValueKey,
    diceCost,
    dieSides,
    poolDice,
    remainingDice: Math.max(0, poolDice - diceCost),
    ...(label ? { label } : {}),
  }
}


export const SEMANTIC_DIE_ROLL_EFFECT = "semantic_die_roll" as const

export type ResolvedSemanticDieRoll = {
  count: number
  sides: number
  modifier: number
  label?: string
}

/**
 * Generic non-damage die roll requested by an action semantic. Useful for
 * utility resources whose die result drives movement, duration, or a later
 * GM-confirmed conditional spend without pretending the roll is damage.
 */
export function resolveSemanticDieRoll(
  action: Pick<ResolvedAction, "effects">,
  values: readonly ResolvedValue[],
): ResolvedSemanticDieRoll | null {
  const effect = action.effects.find(
    (item) =>
      item.kind === "semantic" &&
      item.key === SEMANTIC_DIE_ROLL_EFFECT,
  )
  if (!effect || effect.kind !== "semantic") return null
  const payload = asRecord(effect.payload)
  if (!payload) return null

  const count = positiveInteger(payload.count) ?? 1
  const literalSides = positiveInteger(payload.sides)
  const valueKey =
    typeof payload.sidesValueKey === "string"
      ? payload.sidesValueKey.trim()
      : ""
  const resolvedValue = valueKey
    ? values.find(
        (value) =>
          value.key === valueKey &&
          value.variantKey === "default",
      )?.value.value
    : undefined
  const sides =
    literalSides ??
    (typeof resolvedValue === "number" &&
    Number.isInteger(resolvedValue) &&
    resolvedValue >= 2
      ? resolvedValue
      : null)

  if (!sides) return null

  const modifier =
    typeof payload.modifier === "number" &&
    Number.isFinite(payload.modifier)
      ? payload.modifier
      : 0
  const label =
    typeof payload.label === "string" && payload.label.trim()
      ? payload.label.trim()
      : undefined

  return {
    count,
    sides,
    modifier,
    ...(label ? { label } : {}),
  }
}
