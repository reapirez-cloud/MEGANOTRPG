import { validateFormula } from "./formulas.ts"
import {
  ABILITY_KEYS,
  type CharacterCondition,
  type CharacterEngineInput,
  type StateFactValue,
} from "./types.ts"

export class CharacterEngineInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CharacterEngineInputError"
  }
}

function requireNonEmpty(value: string, field: string) {
  if (!value.trim()) throw new CharacterEngineInputError(`${field} must not be empty`)
}

function requireFinite(value: number, field: string) {
  if (!Number.isFinite(value)) throw new CharacterEngineInputError(`${field} must be a finite number`)
}

function validateFactValue(value: StateFactValue, field: string) {
  if (typeof value === "number") requireFinite(value, field)
}

function validateCondition(condition: CharacterCondition, field: string): void {
  switch (condition.kind) {
    case "always": return
    case "hp_below_percent":
      requireFinite(condition.percent, `${field}.percent`)
      if (condition.percent < 0 || condition.percent > 100) {
        throw new CharacterEngineInputError(`${field}.percent must be between 0 and 100`)
      }
      return
    case "state":
      requireNonEmpty(condition.key, `${field}.key`)
      if ("value" in condition) validateFactValue(condition.value, `${field}.value`)
      return
    case "all":
    case "any":
      if (condition.conditions.length === 0) {
        throw new CharacterEngineInputError(`${field}.conditions must not be empty`)
      }
      condition.conditions.forEach((child, index) => validateCondition(child, `${field}.conditions[${index}]`))
      return
    case "not":
      validateCondition(condition.condition, `${field}.condition`)
  }
}

export function validateCharacterEngineInput(input: CharacterEngineInput) {
  const { base, state, contributions } = input
  requireNonEmpty(base.id, "base.id")
  requireNonEmpty(base.name, "base.name")
  if (!Number.isInteger(base.level) || base.level < 1) {
    throw new CharacterEngineInputError("base.level must be an integer >= 1")
  }
  for (const ability of ABILITY_KEYS) requireFinite(base.abilities[ability], `base.abilities.${ability}`)
  requireFinite(base.baseMaxHp, "base.baseMaxHp")
  requireFinite(base.baseSpeed, "base.baseSpeed")
  requireFinite(state.currentHp, "state.currentHp")
  requireFinite(state.tempHp, "state.tempHp")
  if (base.baseMaxHp < 0) throw new CharacterEngineInputError("base.baseMaxHp must be >= 0")
  if (base.baseSpeed < 0) throw new CharacterEngineInputError("base.baseSpeed must be >= 0")
  if (state.tempHp < 0) throw new CharacterEngineInputError("state.tempHp must be >= 0")

  for (const [resourceKey, resource] of Object.entries(state.resources ?? {})) {
    requireNonEmpty(resourceKey, "state.resources key")
    requireFinite(resource.current, `state.resources.${resourceKey}.current`)
    if (resource.max !== undefined) requireFinite(resource.max, `state.resources.${resourceKey}.max`)
  }
  for (const [factKey, factValue] of Object.entries(state.facts ?? {})) {
    requireNonEmpty(factKey, "state.facts key")
    validateFactValue(factValue, `state.facts.${factKey}`)
  }

  const contributionIds = new Set<string>()
  for (const contribution of contributions) {
    requireNonEmpty(contribution.id, "contribution.id")
    if (contributionIds.has(contribution.id)) {
      throw new CharacterEngineInputError(`duplicate contribution id: ${contribution.id}`)
    }
    contributionIds.add(contribution.id)
    requireNonEmpty(contribution.source.id, `contribution.${contribution.id}.source.id`)
    requireNonEmpty(contribution.source.name, `contribution.${contribution.id}.source.name`)
    if (contribution.priority !== undefined) requireFinite(contribution.priority, `contribution.${contribution.id}.priority`)
    if (contribution.condition) validateCondition(contribution.condition, `contribution.${contribution.id}.condition`)

    if (contribution.kind === "numeric") {
      requireFinite(contribution.value, `contribution.${contribution.id}.value`)
    } else if (contribution.kind === "formula") {
      validateFormula(contribution.formula)
    } else {
      requireNonEmpty(contribution.key, `contribution.${contribution.id}.key`)
    }
  }
}

export function createCharacterEngineInput(input: CharacterEngineInput): CharacterEngineInput {
  validateCharacterEngineInput(input)
  return input
}
