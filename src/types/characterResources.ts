import type { ResourceRechargeRule } from "../character-engine/index.ts"

export type CharacterResourceStateRow = {
  character_id: string
  state_key: string
  current: number
  max_snapshot: number
  label: string
  recharge: ResourceRechargeRule
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type ResourceSyncInput = {
  stateKey: string
  current: number
  max: number
  label: string
  recharge: ResourceRechargeRule
}

export type ResourceCostInput = ResourceSyncInput & { amount: number }
