import type { ResourceRechargeRule, ResourceRechargeTrigger } from "../character-engine/index.ts"

export type ResourceRecoveryStep =
  | { trigger: Exclude<ResourceRechargeTrigger, "never">; restore: "full" }
  | { trigger: Exclude<ResourceRechargeTrigger, "never">; restore: "amount"; amount: number }

/**
 * Database runtime may preserve a richer recovery schedule than the CE display
 * contract. This keeps recovery bookkeeping generic without making CE interpret
 * class names such as Fighter or Cleric.
 */
export type PersistedResourceRecharge =
  | ResourceRechargeRule
  | { rules: ResourceRecoveryStep[] }

export type CharacterResourceStateRow = {
  character_id: string
  state_key: string
  current: number
  max_snapshot: number
  label: string
  recharge: PersistedResourceRecharge
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type ResourceSyncInput = {
  stateKey: string
  current: number
  max: number
  label: string
  recharge: PersistedResourceRecharge
}

export type ResourceCostInput = ResourceSyncInput & { amount: number }
