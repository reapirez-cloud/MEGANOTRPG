import type {
  AbilityKey,
  ActionCostOption,
  ActionEffectDefinition,
  ActionRange,
  ActionRequirementDefinition,
  ActionResourceCost,
  CharacterCondition,
  FormulaExpression,
  GrantPayload,
  GrantTarget,
  NumericOperation,
  NumericTarget,
  ResourceRechargeTrigger,
  SpellGrantPayload,
} from "../character-engine/index.ts"

export type MechanicActivation = "carried" | "equipped"
export type MechanicModuleTone = "neutral" | "violet" | "blue" | "cyan" | "green" | "amber" | "red"
export type MechanicModuleDisplay = "counter" | "pips" | "bar"
export type StoredGrantOperation = "GRANT" | "REPLACE"

/** Presentation metadata is renderer-only. Character Engine never branches on it. */
export type StoredMechanicPresentation = {
  tone?: MechanicModuleTone
  icon?: string
  display?: MechanicModuleDisplay
  priority?: number
}

type StoredMechanicMeta = {
  activation?: MechanicActivation
  condition?: CharacterCondition
  /** Stable parser-side source group. Mechanics sharing a sourceKey are one switchable feature. */
  sourceKey?: string
  variantKey?: string
  priority?: number
  grantOperation?: StoredGrantOperation
  curseEffect?: boolean
}

export type StoredNumericMechanic = StoredMechanicMeta & {
  id: string
  type: "numeric"
  label?: string
  target: NumericTarget
  operation: NumericOperation
  value: number
}

export type StoredGrantMechanic = StoredMechanicMeta & {
  id: string
  type: "grant"
  label?: string
  target: Exclude<GrantTarget, "resource" | "action" | "spell">
  key: string
  payload?: GrantPayload
}

export type StoredResourceMechanic = StoredMechanicMeta & {
  id: string
  type: "resource"
  key: string
  label: string
  max: number | FormulaExpression
  recharge: ResourceRechargeTrigger | ResourceRechargeTrigger[]
  restore?: "full" | "amount"
  restoreAmount?: number
  initial?: "full" | "empty" | number
  presentation?: StoredMechanicPresentation
}

export type StoredActionDamage = {
  key: string
  label?: string
  damageType: string
  count: number | FormulaExpression
  sides: number | FormulaExpression
  ability?: AbilityKey
  flat?: number
}

export type StoredActionMechanic = StoredMechanicMeta & {
  id: string
  type: "action"
  key: string
  label: string
  economy: string
  range?: ActionRange
  attackAbility?: AbilityKey
  proficient?: boolean
  attackFlat?: number
  damage?: StoredActionDamage[]
  /** Legacy single-cost fields kept for existing rows. */
  resourceKey?: string
  resourceCost?: number
  /** Canonical CE-native mechanics for new class/item definitions. */
  resourceCosts?: ActionResourceCost[]
  costOptions?: ActionCostOption[]
  requirements?: ActionRequirementDefinition[]
  effects?: ActionEffectDefinition[]
  tags?: string[]
  presentation?: StoredMechanicPresentation
}

export type StoredSpellMechanic = StoredMechanicMeta & {
  id: string
  type: "spell"
  key: string
  payload: SpellGrantPayload
}

export type StoredMechanic =
  | StoredNumericMechanic
  | StoredGrantMechanic
  | StoredResourceMechanic
  | StoredActionMechanic
  | StoredSpellMechanic

export type StoredMechanics = StoredMechanic[]
