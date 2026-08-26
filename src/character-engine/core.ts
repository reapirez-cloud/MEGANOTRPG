import { ABILITY_KEYS, type CharacterEngineInput } from "./types.ts"

export class CharacterEngineInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CharacterEngineInputError"
  }
}

function requireNonEmpty(value: string, field: string) {
  if (!value.trim()) {
    throw new CharacterEngineInputError(`${field} must not be empty`)
  }
}

function requireFinite(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw new CharacterEngineInputError(`${field} must be a finite number`)
  }
}

/**
 * Checks structural invariants only. Game-rule semantics belong to later
 * engine layers, not to Character Core.
 */
export function validateCharacterEngineInput(input: CharacterEngineInput) {
  const { base, state, contributions } = input

  requireNonEmpty(base.id, "base.id")
  requireNonEmpty(base.name, "base.name")

  if (!Number.isInteger(base.level) || base.level < 1) {
    throw new CharacterEngineInputError("base.level must be an integer >= 1")
  }

  for (const ability of ABILITY_KEYS) {
    requireFinite(base.abilities[ability], `base.abilities.${ability}`)
  }

  requireFinite(base.baseMaxHp, "base.baseMaxHp")
  requireFinite(base.baseSpeed, "base.baseSpeed")
  requireFinite(state.currentHp, "state.currentHp")
  requireFinite(state.tempHp, "state.tempHp")

  if (base.baseMaxHp < 0) {
    throw new CharacterEngineInputError("base.baseMaxHp must be >= 0")
  }
  if (base.baseSpeed < 0) {
    throw new CharacterEngineInputError("base.baseSpeed must be >= 0")
  }
  if (state.tempHp < 0) {
    throw new CharacterEngineInputError("state.tempHp must be >= 0")
  }

  for (const [resourceKey, resource] of Object.entries(state.resources ?? {})) {
    requireNonEmpty(resourceKey, "state.resources key")
    requireFinite(resource.current, `state.resources.${resourceKey}.current`)
    if (resource.max !== undefined) {
      requireFinite(resource.max, `state.resources.${resourceKey}.max`)
    }
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

    if (contribution.priority !== undefined) {
      requireFinite(contribution.priority, `contribution.${contribution.id}.priority`)
    }

    if (contribution.condition?.kind === "hp_below_percent") {
      requireFinite(
        contribution.condition.percent,
        `contribution.${contribution.id}.condition.percent`,
      )
      if (contribution.condition.percent < 0 || contribution.condition.percent > 100) {
        throw new CharacterEngineInputError(
          `contribution.${contribution.id}.condition.percent must be between 0 and 100`,
        )
      }
    }

    if (contribution.kind === "numeric") {
      requireFinite(contribution.value, `contribution.${contribution.id}.value`)
    } else {
      requireNonEmpty(contribution.key, `contribution.${contribution.id}.key`)
    }
  }
}

export function createCharacterEngineInput(
  input: CharacterEngineInput,
): CharacterEngineInput {
  validateCharacterEngineInput(input)
  return input
}
