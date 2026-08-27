import type {
  AbilityKey,
  ActionRange,
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

export type StoredNumericMechanic = {
  id: string
  type: "numeric"
  label?: string
  target: NumericTarget
  operation: NumericOperation
  value: number
  activation?: MechanicActivation
  condition?: CharacterCondition
}

export type StoredGrantMechanic = {
  id: string
  type: "grant"
  label?: string
  target: Exclude<GrantTarget, "resource" | "action" | "spell">
  key: string
  payload?: GrantPayload
  activation?: MechanicActivation
  condition?: CharacterCondition
}

export type StoredResourceMechanic = {
  id: string
  type: "resource"
  key: string
  label: string
  max: number | FormulaExpression
  /** Old stored rows may contain one string; adapters normalize both shapes. */
  recharge: ResourceRechargeTrigger | ResourceRechargeTrigger[]
  restore?: "full" | "amount"
  restoreAmount?: number
  initial?: "full" | "empty" | number
  activation?: MechanicActivation
  condition?: CharacterCondition
}

export type StoredActionDamage = {
  key: string
  label?: string
  damageType: string
  count: number
  sides: number
  ability?: AbilityKey
  flat?: number
}

export type StoredActionMechanic = {
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
  resourceKey?: string
  resourceCost?: number
  tags?: string[]
  activation?: MechanicActivation
  condition?: CharacterCondition
}

export type StoredSpellMechanic = {
  id: string
  type: "spell"
  key: string
  payload: SpellGrantPayload
  activation?: MechanicActivation
  condition?: CharacterCondition
}

export type StoredMechanic =
  | StoredNumericMechanic
  | StoredGrantMechanic
  | StoredResourceMechanic
  | StoredActionMechanic
  | StoredSpellMechanic

export type StoredMechanics = StoredMechanic[]
