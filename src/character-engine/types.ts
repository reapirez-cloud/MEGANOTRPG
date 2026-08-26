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

export const PASSIVE_KEYS = ["perception", "investigation", "insight"] as const
export type PassiveKey = (typeof PASSIVE_KEYS)[number]

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

export type StateFactValue = string | number | boolean | null

export interface CharacterState {
  currentHp: number
  tempHp: number
  resources?: Record<string, ResourceState>
  facts?: Record<string, StateFactValue>
}

export interface ResourceState {
  current: number
  max?: number
}

export type SourceVisibility = "campaign" | "private"

/** Provenance only. Engine mechanics must not branch on sourceType. */
export interface CharacterSource {
  id: string
  name: string
  sourceType?: string
  parentSourceId?: string
  visibility?: SourceVisibility
}

export type StateCondition =
  | { kind: "state"; key: string; operator: "EXISTS" | "NOT_EXISTS" }
  | {
      kind: "state"
      key: string
      operator: "EQUALS" | "NOT_EQUALS"
      value: StateFactValue
    }
  | {
      kind: "state"
      key: string
      operator: "GT" | "GTE" | "LT" | "LTE"
      value: number
    }

export type CharacterCondition =
  | { kind: "always" }
  | { kind: "hp_below_percent"; percent: number }
  | StateCondition
  | { kind: "all"; conditions: CharacterCondition[] }
  | { kind: "any"; conditions: CharacterCondition[] }
  | { kind: "not"; condition: CharacterCondition }

export type NumericTarget =
  | `abilities.${AbilityKey}`
  | "core.proficiencyBonus"
  | `skills.${SkillKey}.bonus`
  | `savingThrows.${AbilityKey}.bonus`
  | `passives.${PassiveKey}`
  | "combat.ac"
  | "combat.initiative"
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

/**
 * Generic formula AST. Reference keys are data, not hard-coded domain concepts.
 * A consumer supplies a finite-number context such as
 * "abilities.dexterity.modifier" -> 2.
 */
export type FormulaExpression =
  | { kind: "literal"; value: number }
  | { kind: "reference"; key: string }
  | { kind: "add"; terms: FormulaExpression[] }
  | { kind: "subtract"; left: FormulaExpression; right: FormulaExpression }
  | { kind: "multiply"; factors: FormulaExpression[] }
  | { kind: "min"; values: FormulaExpression[] }
  | { kind: "max"; values: FormulaExpression[] }
  | { kind: "clamp"; value: FormulaExpression; min?: number; max?: number }

export type FormulaTarget = "combat.ac"

export interface FormulaContribution {
  id: string
  kind: "formula"
  target: FormulaTarget
  operation: "SET_FORMULA"
  formula: FormulaExpression
  source: CharacterSource
  condition?: CharacterCondition
  priority?: number
}

/** JSON-compatible mechanical data attached to a grant. */
export type GrantPayload =
  | string
  | number
  | boolean
  | null
  | GrantPayload[]
  | { [key: string]: GrantPayload }

export type ProficiencyGrantPayload = { rank: 1 | 2 }
export type SenseGrantPayload = { range?: number; unit?: string }

export type GrantTarget =
  | "resistance"
  | "immunity"
  | "language"
  | "proficiency"
  | "sense"
  | "feature"
  | "trait"
  | "resource"
  | "spell"

export interface GrantContribution<TPayload extends GrantPayload = GrantPayload> {
  id: string
  kind: "grant"
  operation: "GRANT" | "SUPPRESS"
  /** Stable identity inside a target, e.g. fire, common, skill:medicine. */
  key: string
  /** Mechanically distinct variants must use distinct keys here. */
  variantKey?: string
  payload?: TPayload
  source: CharacterSource
  condition?: CharacterCondition
  priority?: number
}

export type CharacterContribution = NumericContribution | FormulaContribution | GrantContribution

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

export interface ResolvedFormulaNumber extends ResolvedNumber {
  formula: FormulaExpression
  formulaSources: ResolvedSourceRef[]
}

export interface ResolvedAbility extends ResolvedNumber {
  modifier: number
}

export interface ResolvedSkill {
  key: SkillKey
  ability: AbilityKey
  proficiencyRank: ProficiencyRank
  proficiencySources: ResolvedSourceRef[]
  bonus: ResolvedNumber
}

export interface ResolvedSavingThrow {
  ability: AbilityKey
  proficiencyRank: ProficiencyRank
  proficiencySources: ResolvedSourceRef[]
  bonus: ResolvedNumber
}

export interface ResolvedGrant<TPayload extends GrantPayload = GrantPayload> {
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
    ac: ResolvedFormulaNumber
    maxHp: ResolvedNumber
    currentHp: number
    tempHp: number
    speed: ResolvedNumber
    initiative: ResolvedNumber
  }
  passives: Record<PassiveKey, ResolvedNumber>
  spellcasting: {
    byAbility: Record<AbilityKey, { saveDc: number; attackBonus: number }>
  }
  grants: ResolvedGrant[]
}
