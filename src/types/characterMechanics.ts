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

type StoredMechanicMeta = {
  activation?: MechanicActivation
  condition?: CharacterCondition
  /** Marks a mechanic as part of an item's curse. CE still resolves it normally; UI may hide it from players. */
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
  /** Old stored rows may contain one string; adapters normalize both shapes. */
  recharge: ResourceRechargeTrigger | ResourceRechargeTrigger[]
  restore?: "full" | "amount"
  restoreAmount?: number
  initial?: "full" | "empty" | number
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
  resourceKey?: string
  resourceCost?: number
  tags?: string[]
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
