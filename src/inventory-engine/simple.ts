import type { InventoryItem } from "../types/characterSheet.ts"
import { inventoryContainerTargets } from "./holders.ts"
import { inventoryPhysicalProfile } from "./spatial.ts"

function inventorySimpleSort(left: InventoryItem, right: InventoryItem) {
  const order = Number(left.sort_order || 0) - Number(right.sort_order || 0)
  if (order !== 0) return order

  const created = String(left.created_at || "").localeCompare(String(right.created_at || ""))
  if (created !== 0) return created

  return left.name.localeCompare(right.name, "ru")
}

export function inventorySimpleContainerCapacity(container: InventoryItem): number {
  const profile = inventoryPhysicalProfile(container).container_profile
  if (!profile) return 1

  const width = Math.max(1, Math.trunc(Number(profile.internal_grid_width || 1)))
  const height = Math.max(1, Math.trunc(Number(profile.internal_grid_height || 1)))
  return Math.min(10000, width * height)
}

export function inventorySimpleChildren(
  items: readonly InventoryItem[],
  holderItemId: string | null,
): InventoryItem[] {
  return items
    .filter((item) =>
      (item.holder_item_id ?? null) === holderItemId &&
      !item.equipped
    )
    .slice()
    .sort(inventorySimpleSort)
}

export function inventorySimpleContainerUsage(
  items: readonly InventoryItem[],
  containerId: string,
) {
  const container = items.find((item) => item.id === containerId) || null
  if (!container || container.category !== "container") {
    return { used: 0, capacity: 0, free: 0, full: true }
  }

  const capacity = inventorySimpleContainerCapacity(container)
  const used = inventorySimpleChildren(items, containerId).length

  return {
    used,
    capacity,
    free: Math.max(0, capacity - used),
    full: used >= capacity,
  }
}

export function inventorySimpleContainerTargets(
  items: readonly InventoryItem[],
  item: InventoryItem,
) {
  return inventoryContainerTargets(items, item)
    .map((container) => ({
      container,
      ...inventorySimpleContainerUsage(items, container.id),
    }))
    .sort((left, right) => left.container.name.localeCompare(right.container.name, "ru"))
}
