import type { GrantPayload, ResolvedCharacterContract, ResolvedResource, ResourceState } from "../character-engine/index.ts"
import type { PersistedResourceRecharge, ResourceCostInput, ResourceRecoveryStep, ResourceSyncInput } from "../types/characterResources.ts"

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

function grantPayload(contract: ResolvedCharacterContract, resource: ResolvedResource): Record<string, unknown> | null {
  const grant = contract.grants.find((entry) => entry.target === "resource" && entry.key === resource.key && entry.variantKey === resource.variantKey)
  const payload: GrantPayload | undefined = grant?.payload
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
}

function grantLabel(contract: ResolvedCharacterContract, resource: ResolvedResource): string {
  const payload = grantPayload(contract, resource)
  const label = payload?.label
  if (typeof label === "string" && label.trim()) return label.trim()
  return resource.key.split(/[_-]+/g).map((part) => part ? `${part[0]!.toLocaleUpperCase("ru-RU")}${part.slice(1)}` : part).join(" ")
}

function recoveryStep(value: unknown): ResourceRecoveryStep | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!['short_rest','long_rest','dawn','manual'].includes(String(record.trigger))) return null
  if (record.restore === "full") {
    return { trigger: record.trigger as ResourceRecoveryStep["trigger"], restore: "full" }
  }
  if (record.restore === "amount" && typeof record.amount === "number" && Number.isFinite(record.amount) && record.amount > 0) {
    return { trigger: record.trigger as ResourceRecoveryStep["trigger"], restore: "amount", amount: record.amount }
  }
  return null
}

function persistedRecharge(contract: ResolvedCharacterContract, resource: ResolvedResource): PersistedResourceRecharge {
  const raw = grantPayload(contract, resource)?.recoveryRules
  if (Array.isArray(raw)) {
    const rules = raw.map(recoveryStep).filter((entry): entry is ResourceRecoveryStep => entry !== null)
    if (rules.length) return { rules }
  }
  return resource.recharge
}

/**
 * Persistent runtime state is shared by every CE resource, including spell slots.
 * Definition/max/recharge come from the resolved contract; the database stores
 * only the mutable current value plus snapshots needed for atomic operations.
 */
export function resourceSyncInputs(contract: ResolvedCharacterContract): ResourceSyncInput[] {
  return contract.resources.map((resource) => ({
    stateKey: resource.stateKey,
    current: resource.current,
    max: resource.max.value,
    label: grantLabel(contract, resource),
    recharge: persistedRecharge(contract, resource),
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
      recharge: resource ? persistedRecharge(contract, resource) : { triggers: ["never"], restore: "full" },
    }
  })
}
