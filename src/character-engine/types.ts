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
   * Distinguishes mechanically different ways to use the same thing.
   * Equal target + key + variantKey contributions are merged, while their sources are preserved.
   */
  variantKey?: string
  payload?: TPayload
  source: CharacterSource
  condition?: CharacterCondition
  priority?: number
}

export type CharacterContribution = NumericContribution | GrantContribution

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
