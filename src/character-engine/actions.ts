import { evaluateCondition } from "./conditions.ts"
import { resolveNumericConflicts } from "./conflicts.ts"
import { evaluateFormula, validateFormula, type FormulaContext } from "./formulas.ts"
import { resourceStateKey } from "./resources.ts"
import type {
  ActionDamageDefinition,
  ActionGrantPayload,
  ActionRange,
  CharacterContribution,
  CharacterState,
  FormulaExpression,
  GrantPayload,
  NumericContribution,
  NumericTarget,
  ResolvedAction,
  ResolvedNumber,
  ResolvedResource,
} from "./types.ts"

export class ActionEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ActionEngineError"
  }
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ActionEngineError(message)
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ActionEngineError(`${field} must be a non-empty string`)
  }
  return value
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ActionEngineError(`${field} must be a finite number >= 0`)
  }
  return value
}

function positiveInteger(value: unknown, field: string, minimum = 1): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new ActionEngineError(`${field} must be an integer >= ${minimum}`)
  }
  return value as number
}

function parseRange(value: unknown): ActionRange {
  const object = asObject(value, "action range must be an object")
  const kind = nonEmptyString(object.kind, "action range.kind")

  if (kind === "self" || kind === "touch") return { kind }
  if (kind === "melee") {
    return {
      kind,
      reach: finiteNonNegative(object.reach, "action range.reach"),
      unit: nonEmptyString(object.unit, "action range.unit"),
    }
  }
  if (kind === "ranged") {
    const normal = finiteNonNegative(object.normal, "action range.normal")
    const unit = nonEmptyString(object.unit, "action range.unit")
    if (object.long === undefined) return { kind, normal, unit }
    const long = finiteNonNegative(object.long, "action range.long")
    if (long < normal) {
      throw new ActionEngineError("action range.long must be >= range.normal")
    }
    return { kind, normal, long, unit }
  }
  if (kind === "area") {
    return {
      kind,
      shape: nonEmptyString(object.shape, "action range.shape"),
      size: finiteNonNegative(object.size, "action range.size"),
      unit: nonEmptyString(object.unit, "action range.unit"),
    }
  }
  if (kind === "custom") {
    return { kind, label: nonEmptyString(object.label, "action range.label") }
  }

  throw new ActionEngineError(`unsupported action range kind: ${kind}`)
}

function parseFormula(value: unknown, field: string): FormulaExpression {
  const formula = value as FormulaExpression
  try {
    validateFormula(formula)
  } catch (error) {
    throw new ActionEngineError(`${field}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return formula
}

function parseDamage(value: unknown, index: number): ActionDamageDefinition {
  const object = asObject(value, `action damage[${index}] must be an object`)
  const key = nonEmptyString(object.key, `action damage[${index}].key`)
  const type = nonEmptyString(object.type, `action damage[${index}].type`)

  let dice: ActionDamageDefinition["dice"]
  if (object.dice !== undefined) {
    const diceObject = asObject(object.dice, `action damage[${index}].dice must be an object`)
    dice = {
      count: positiveInteger(diceObject.count, `action damage[${index}].dice.count`),
      sides: positiveInteger(diceObject.sides, `action damage[${index}].dice.sides`, 2),
    }
  }

  const modifier =
    object.modifier === undefined
      ? undefined
      : parseFormula(object.modifier, `action damage[${index}].modifier`)

  if (!dice && !modifier) {
    throw new ActionEngineError(`action damage[${index}] must define dice and/or modifier`)
  }

  return {
    key,
    type,
    ...(dice ? { dice } : {}),
    ...(modifier ? { modifier } : {}),
  }
}

/** Runtime validation + normalization for an action GRANT payload. */
export function parseActionGrantPayload(payload: GrantPayload | undefined): ActionGrantPayload {
  const object = asObject(payload, "action grant payload must be an object")
  const economy = nonEmptyString(object.economy, "action economy")

  let attack: ActionGrantPayload["attack"]
  if (object.attack !== undefined) {
    const attackObject = asObject(object.attack, "action attack must be an object")
    attack = {
      bonus: parseFormula(attackObject.bonus, "action attack.bonus"),
      ...(attackObject.target === undefined
        ? {}
        : { target: nonEmptyString(attackObject.target, "action attack.target") }),
      ...(attackObject.criticalThreshold === undefined
        ? {}
        : {
            criticalThreshold: positiveInteger(
              attackObject.criticalThreshold,
              "action attack.criticalThreshold",
            ),
          }),
    }
    if (attack.criticalThreshold !== undefined && attack.criticalThreshold > 20) {
      throw new ActionEngineError("action attack.criticalThreshold must be <= 20")
    }
  }

  let damage: ActionDamageDefinition[] | undefined
  if (object.damage !== undefined) {
    if (!Array.isArray(object.damage) || object.damage.length === 0) {
      throw new ActionEngineError("action damage must be a non-empty array")
    }
    damage = object.damage.map(parseDamage)
    const damageKeys = new Set<string>()
    for (const component of damage) {
      if (damageKeys.has(component.key)) {
        throw new ActionEngineError(`duplicate action damage key: ${component.key}`)
      }
      damageKeys.add(component.key)
    }
  }

  let resourceCosts: ActionGrantPayload["resourceCosts"]
  if (object.resourceCosts !== undefined) {
    if (!Array.isArray(object.resourceCosts) || object.resourceCosts.length === 0) {
      throw new ActionEngineError("action resourceCosts must be a non-empty array")
    }
    resourceCosts = object.resourceCosts.map((rawCost, index) => {
      const cost = asObject(rawCost, `action resourceCosts[${index}] must be an object`)
      const key = nonEmptyString(cost.key, `action resourceCosts[${index}].key`)
      const variantKey =
        cost.variantKey === undefined
          ? undefined
          : nonEmptyString(cost.variantKey, `action resourceCosts[${index}].variantKey`)
      const amount = finiteNonNegative(cost.amount, `action resourceCosts[${index}].amount`)
      if (amount === 0) {
        throw new ActionEngineError(`action resourceCosts[${index}].amount must be > 0`)
      }
      return { key, ...(variantKey ? { variantKey } : {}), amount }
    })

    const stateKeys = new Set<string>()
    for (const cost of resourceCosts) {
      const stateKey = resourceStateKey(cost.key, cost.variantKey ?? "default")
      if (stateKeys.has(stateKey)) {
        throw new ActionEngineError(`duplicate action resource cost: ${stateKey}`)
      }
      stateKeys.add(stateKey)
    }
  }

  let tags: string[] | undefined
  if (object.tags !== undefined) {
    if (!Array.isArray(object.tags)) throw new ActionEngineError("action tags must be an array")
    tags = object.tags.map((tag, index) => nonEmptyString(tag, `action tags[${index}]`))
    if (new Set(tags).size !== tags.length) {
      throw new ActionEngineError("action tags must be unique")
    }
  }

  return {
    economy,
    ...(object.label === undefined ? {} : { label: nonEmptyString(object.label, "action label") }),
    ...(object.range === undefined ? {} : { range: parseRange(object.range) }),
    ...(attack ? { attack } : {}),
    ...(damage ? { damage } : {}),
    ...(resourceCosts ? { resourceCosts } : {}),
    ...(tags ? { tags } : {}),
  }
}

export function actionStateKey(key: string, variantKey = "default"): string {
  return variantKey === "default" ? key : `${key}::${variantKey}`
}

export function actionAttackBonusTarget(stateKey: string): NumericTarget {
  return `actions.${stateKey}.attackBonus`
}

export function actionDamageModifierTarget(stateKey: string, damageKey: string): NumericTarget {
  return `actions.${stateKey}.damage.${damageKey}.modifier`
}

function resolveActionNumber(
  target: NumericTarget,
  baseValue: number,
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHp: number,
): ResolvedNumber {
  const relevant = contributions.filter(
    (contribution): contribution is NumericContribution =>
      contribution.kind === "numeric" &&
      contribution.target === target &&
      evaluateCondition(contribution.condition, { state, maxHp }),
  )
  const resolution = resolveNumericConflicts(baseValue, relevant)
  return {
    value: resolution.value,
    baseValue,
    sources: resolution.contributions.map((contribution) => ({
      contributionId: contribution.id,
      source: contribution.source,
    })),
  }
}

/** Resolves active action grants into ready-to-render/use mechanical actions. */
export function resolveActions(
  grants: { target: string; key: string; variantKey: string; payload?: GrantPayload; sources: ResolvedAction["sources"] }[],
  contributions: CharacterContribution[],
  resources: ResolvedResource[],
  state: CharacterState,
  maxHp: number,
  formulaContext: FormulaContext,
): ResolvedAction[] {
  return grants
    .filter((grant) => grant.target === "action")
    .map((grant) => {
      const definition = parseActionGrantPayload(grant.payload)
      const stateKey = actionStateKey(grant.key, grant.variantKey)

      const attack = definition.attack
        ? {
            formula: definition.attack.bonus,
            bonus: resolveActionNumber(
              actionAttackBonusTarget(stateKey),
              evaluateFormula(definition.attack.bonus, formulaContext),
              contributions,
              state,
              maxHp,
            ),
            ...(definition.attack.target === undefined ? {} : { target: definition.attack.target }),
            ...(definition.attack.criticalThreshold === undefined
              ? {}
              : { criticalThreshold: definition.attack.criticalThreshold }),
          }
        : undefined

      const damage = (definition.damage ?? []).map((component) => {
        const baseModifier = component.modifier
          ? evaluateFormula(component.modifier, formulaContext)
          : 0
        return {
          key: component.key,
          type: component.type,
          ...(component.dice ? { dice: component.dice } : {}),
          modifier: resolveActionNumber(
            actionDamageModifierTarget(stateKey, component.key),
            baseModifier,
            contributions,
            state,
            maxHp,
          ),
          ...(component.modifier ? { modifierFormula: component.modifier } : {}),
        }
      })

      const resourceCosts = (definition.resourceCosts ?? []).map((cost) => {
        const variantKey = cost.variantKey ?? "default"
        const stateKey = resourceStateKey(cost.key, variantKey)
        const resource = resources.find((candidate) => candidate.stateKey === stateKey)
        const current = resource?.current ?? 0
        return {
          key: cost.key,
          variantKey,
          stateKey,
          amount: cost.amount,
          current,
          max: resource?.max.value ?? 0,
          available: resource !== undefined && current >= cost.amount,
        }
      })

      return {
        key: grant.key,
        variantKey: grant.variantKey,
        stateKey,
        ...(definition.label === undefined ? {} : { label: definition.label }),
        economy: definition.economy,
        ...(definition.range === undefined ? {} : { range: definition.range }),
        ...(attack ? { attack } : {}),
        damage,
        resourceCosts,
        tags: definition.tags ?? [],
        available: resourceCosts.every((cost) => cost.available),
        sources: grant.sources,
      }
    })
    .sort((left, right) => left.stateKey.localeCompare(right.stateKey))
}

/** Atomically spends every resolved resource cost of one action. */
export function applyActionResourceCosts(state: CharacterState, action: ResolvedAction): CharacterState {
  if (!action.available) {
    throw new ActionEngineError(`action resources are unavailable: ${action.stateKey}`)
  }

  const resources = Object.fromEntries(
    Object.entries(state.resources ?? {}).map(([key, value]) => [key, { ...value }]),
  )

  for (const cost of action.resourceCosts) {
    if (cost.current < cost.amount) {
      throw new ActionEngineError(`insufficient resource for action: ${cost.stateKey}`)
    }
    resources[cost.stateKey] = { current: cost.current - cost.amount }
  }

  return { ...state, resources }
}
