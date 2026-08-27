import type { ResolvedCharacterContract, ResolvedResource, ResourceState } from "../character-engine/index.ts"
import type { ResourceCostInput, ResourceSyncInput } from "../types/characterResources.ts"

const runtimeRegistry = new Map<string, Record<string, ResourceState>>()

export function registerCharacterResourceState(characterId: string, state: Record<string, ResourceState>) {
  runtimeRegistry.set(characterId, state)
}

export function clearCharacterResourceState(characterId: string) {
  runtimeRegistry.delete(characterId)
}

export function registeredCharacterResourceState(characterId: string): Record<string, ResourceState> {
  return runtimeRegistry.get(characterId) || {}
}

function grantLabel(contract: ResolvedCharacterContract, resource: ResolvedResource): string {
  const grant = contract.grants.find((entry) => entry.target === "resource" && entry.key === resource.key && entry.variantKey === resource.variantKey)
  if (grant?.payload && typeof grant.payload === "object" && !Array.isArray(grant.payload)) {
    const label = (grant.payload as Record<string, unknown>).label
    if (typeof label === "string" && label.trim()) return label.trim()
  }
  return resource.key.split(/[_-]+/g).map((part) => part ? `${part[0]!.toLocaleUpperCase("ru-RU")}${part.slice(1)}` : part).join(" ")
}

export function resourceSyncInputs(contract: ResolvedCharacterContract): ResourceSyncInput[] {
  return contract.resources
    .filter((resource) => !resource.stateKey.startsWith("spell_slot_"))
    .map((resource) => ({
      stateKey: resource.stateKey,
      current: resource.current,
      max: resource.max.value,
      label: grantLabel(contract, resource),
      recharge: resource.recharge,
    }))
}

export function resourceCostInputs(contract: ResolvedCharacterContract, costs: Array<{ stateKey: string; amount: number; current: number; max: number }>): ResourceCostInput[] {
  const byStateKey = new Map(contract.resources.map((resource) => [resource.stateKey, resource]))
  return costs.map((cost) => {
    const resource = byStateKey.get(cost.stateKey)
    return {
      stateKey: cost.stateKey,
      amount: cost.amount,
      current: cost.current,
      max: cost.max,
      label: resource ? grantLabel(contract, resource) : cost.stateKey,
      recharge: resource?.recharge || { triggers: ["never"], restore: "full" },
    }
  })
}
