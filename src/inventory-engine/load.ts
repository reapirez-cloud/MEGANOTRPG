import type { InventoryItem } from "../types/characterSheet.ts"
import { readInventoryProfile } from "./profile.ts"
import type { InventoryLoadProjection } from "./types.ts"

function roundKg(value: number) {
  return Math.round(value * 1000) / 1000
}

/** Per-unit canonical mass in kg. NULL means unknown, never zero. */
export function inventoryUnitWeightKg(item: Pick<InventoryItem, "weight" | "inventory_profile">): number | null {
  const profile = readInventoryProfile(item.inventory_profile)
  const profileWeight = profile?.weight_per_unit
  if (typeof profileWeight === "number" && Number.isFinite(profileWeight) && profileWeight >= 0) return profileWeight
  return typeof item.weight === "number" && Number.isFinite(item.weight) && item.weight >= 0 ? item.weight : null
}

/** Counts every character-owned item exactly once, including nested container contents. */
export function createInventoryLoadProjection(
  characterId: string,
  items: readonly InventoryItem[],
): InventoryLoadProjection {
  let knownWeightKg = 0
  const unknownWeightItemIds: string[] = []
  for (const item of items) {
    if (item.character_id !== characterId || item.quantity <= 0) continue
    const unitWeightKg = inventoryUnitWeightKg(item)
    if (unitWeightKg === null) {
      unknownWeightItemIds.push(item.id)
      continue
    }
    knownWeightKg += unitWeightKg * item.quantity
  }
  unknownWeightItemIds.sort()
  return {
    characterId,
    knownWeightKg: roundKg(knownWeightKg),
    unknownWeightItemIds,
    complete: unknownWeightItemIds.length === 0,
  }
}

export type InventorySpecializedCapacityUsage = {
  semanticRole: string
  quantity: number
  maxQuantity: number
}

export function inventorySpecializedCapacityUsage(
  items: readonly InventoryItem[],
  holder: InventoryItem,
): InventorySpecializedCapacityUsage[] {
  const rules = readInventoryProfile(holder.inventory_profile)?.container_profile?.specialized_capacity || []
  return rules.map((rule) => ({
    semanticRole: rule.semantic_role,
    quantity: items.reduce((total, item) => {
      if (item.holder_item_id !== holder.id) return total
      const role = readInventoryProfile(item.inventory_profile)?.semantic_role
      return role === rule.semantic_role ? total + Math.max(0, item.quantity) : total
    }, 0),
    maxQuantity: rule.max_quantity,
  }))
}

export function inventorySpecializedCapacityProblem(
  items: readonly InventoryItem[],
  holder: InventoryItem,
): string | null {
  const overflow = inventorySpecializedCapacityUsage(items, holder).find((entry) => entry.quantity > entry.maxQuantity)
  return overflow
    ? `Специализированная ёмкость ${overflow.semanticRole}: ${overflow.quantity}/${overflow.maxQuantity}.`
    : null
}
