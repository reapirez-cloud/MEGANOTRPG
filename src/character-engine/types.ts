export const ABILITY_KEYS = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const

export type AbilityKey = (typeof ABILITY_KEYS)[number]

export const SKILL_KEYS = [
  "acrobatics",
  "animal_handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight_of_hand",
  "stealth",
  "survival",
] as const

export type SkillKey = (typeof SKILL_KEYS)[number]
export type ProficiencyRank = 0 | 1 | 2

/**
 * Raw character facts. This is input truth, not a place for values that the
 * engine can derive from other facts.
 */
export interface BaseCharacter {
  id: string
  name: string
  level: number
  abilities: Record<AbilityKey, number>
  baseMaxHp: number
  baseSpeed: number
  skillProficiencies?: Partial<Record<SkillKey, ProficiencyRank>>
  savingThrowProficiencies?: Partial<Record<AbilityKey, ProficiencyRank>>
}

/** Mutable gameplay state. It is intentionally separate from BaseCharacter. */
export interface CharacterState {
  currentHp: number
  tempHp: number
  resources?: Record<string, ResourceState>
}

export interface ResourceState {
  current: number
  max?: number
}

export type SourceVisibility = "campaign" | "private"

/**
 * Provenance only: who/what supplied a contribution.
 *
 * RED FLAG: sourceType is descriptive metadata. It must never be used as a
 * casting/access method or as a UI abbreviation. The engine must not branch on
 * concrete source types such as class/item/feat/frog-school.
 */
export interface CharacterSource {
  id: string
  name: string
  sourceType?: string
  parentSourceId?: string
  visibility?: SourceVisibility
}

export type CharacterCondition =
  | { kind: "always" }
  | { kind: "hp_below_percent"; percent: number }

export type NumericTarget =
  | `abilities.${AbilityKey}`
  | "core.proficiencyBonus"
  | "combat.maxHp"
  | "combat.speed"

export type NumericOperation = "ADD" | "SUBTRACT" | "SET" | "MIN" | "MAX" | "MULTIPLY"

export interface NumericContribution {
  id: string
  kind: "numeric"
  target: NumericTarget
  operation: NumericOperation
  value: number
  source: CharacterSource
  condition?: CharacterCondition
  priority?: number
}

export type GrantTarget =
  | "resistance"
  | "immunity"
  | "language"
  | "proficiency"
  | "feature"
  | "resource"
  | "spell"

export interface GrantContribution<TPayload = unknown> {
  id: string
  kind: "grant"
  operation: "GRANT" | "SUPPRESS"
  target: GrantTarget
  /** Stable identity of the granted thing, e.g. "fire" or "cure-wounds". */
  key: string
  /**
   * Distinguishes mechanically different variants of the same grant.
   * This is not a UI label and must not encode presentation abbreviations.
   */
  variantKey?: string
  payload?: TPayload
  source: CharacterSource
  condition?: CharacterCondition
  priority?: number
}

export type CharacterContribution = NumericContribution | GrantContribution

/** Canonical input boundary for Character Engine. */
export interface CharacterEngineInput {
  base: BaseCharacter
  state: CharacterState
  contributions: CharacterContribution[]
}

export interface ResolvedSourceRef {
  contributionId: string
  source: CharacterSource
}

export interface ResolvedNumber {
  value: number
  baseValue: number
  sources: ResolvedSourceRef[]
}

export interface ResolvedAbility extends ResolvedNumber {
  modifier: number
}

export interface ResolvedSkill {
  key: SkillKey
  ability: AbilityKey
  proficiencyRank: ProficiencyRank
  bonus: number
}

export interface ResolvedSavingThrow {
  ability: AbilityKey
  proficiencyRank: ProficiencyRank
  bonus: number
}

export interface ResolvedGrant<TPayload = unknown> {
  target: GrantTarget
  key: string
  variantKey: string
  payload?: TPayload
  sources: ResolvedSourceRef[]
}

/**
 * Final normalized character state. Consumers should render/read this object
 * instead of re-running character rules themselves.
 */
export interface ResolvedCharacter {
  id: string
  name: string
  level: number
  proficiencyBonus: ResolvedNumber
  abilities: Record<AbilityKey, ResolvedAbility>
  skills: Record<SkillKey, ResolvedSkill>
  savingThrows: Record<AbilityKey, ResolvedSavingThrow>
  combat: {
    maxHp: ResolvedNumber
    currentHp: number
    tempHp: number
    speed: ResolvedNumber
    initiative: number
  }
  passives: {
    perception: number
    investigation: number
    insight: number
  }
  spellcasting: {
    byAbility: Record<AbilityKey, { saveDc: number; attackBonus: number }>
  }
  grants: ResolvedGrant[]
}
