import type { InventoryItem } from "../types/characterSheet.ts"

// Product target for holders, spatial grids, carry sockets, scene surfaces and trade:
// docs/INVENTORY_PRODUCT_CONTRACT.md. Current Stage 4 holder state is only the foundation.

export type InventoryHolderProblem =
  | "self"
  | "missing"
  | "different_character"
  | "not_container"
  | "cycle"
  | "depth"

export function inventoryChildren(
  items: readonly InventoryItem[],
  holderItemId: string | null,
): InventoryItem[] {
  return items.filter((item) => (item.holder_item_id ?? null) === holderItemId)
}

export function inventoryHolder(
  items: readonly InventoryItem[],
  item: Pick<InventoryItem, "holder_item_id">,
): InventoryItem | null {
  const holderId = item.holder_item_id ?? null
  return holderId ? items.find((entry) => entry.id === holderId) ?? null : null
}

export function sameInventoryOwnerScope(
  left: Pick<InventoryItem, "character_id" | "world_storage_id" | "surface_id">,
  right: Pick<InventoryItem, "character_id" | "world_storage_id" | "surface_id">,
): boolean {
  return (left.character_id ?? null) === (right.character_id ?? null)
    && (left.world_storage_id ?? null) === (right.world_storage_id ?? null)
    && (left.surface_id ?? null) === (right.surface_id ?? null)
}

export function inventoryHolderProblem(
  items: readonly InventoryItem[],
  item: Pick<InventoryItem, "id" | "character_id" | "world_storage_id" | "surface_id">,
  holderItemId: string | null,
  maxDepth = 16,
): InventoryHolderProblem | null {
  if (!holderItemId) return null
  if (holderItemId === item.id) return "self"

  const byId = new Map(items.map((entry) => [entry.id, entry]))
  let cursor = byId.get(holderItemId)
  if (!cursor) return "missing"
  if (!sameInventoryOwnerScope(cursor, item)) return "different_character"
  if (cursor.category !== "container") return "not_container"

  const seen = new Set<string>()
  let depth = 1
  while (cursor) {
    if (cursor.id === item.id) return "cycle"
    if (seen.has(cursor.id)) return "cycle"
    seen.add(cursor.id)

    const parentId = cursor.holder_item_id ?? null
    if (!parentId) return null

    depth += 1
    if (depth > maxDepth) return "depth"

    cursor = byId.get(parentId)
    if (!cursor) return "missing"
    if (!sameInventoryOwnerScope(cursor, item)) return "different_character"
  }

  return null
}

export function inventoryContainerTargets(
  items: readonly InventoryItem[],
  item: InventoryItem,
): InventoryItem[] {
  return items
    .filter((candidate) =>
      sameInventoryOwnerScope(candidate, item) &&
      candidate.category === "container" &&
      candidate.id !== item.id &&
      candidate.id !== (item.holder_item_id ?? null) &&
      inventoryHolderProblem(items, item, candidate.id) === null
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
}

export function inventorySubtreeIds(
  items: readonly InventoryItem[],
  rootItemId: string,
): string[] {
  const children = new Map<string, string[]>()
  for (const item of items) {
    const holderId = item.holder_item_id ?? null
    if (!holderId) continue
    const current = children.get(holderId) ?? []
    current.push(item.id)
    children.set(holderId, current)
  }

  const result: string[] = []
  const queue = [...(children.get(rootItemId) ?? [])]
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
    queue.push(...(children.get(id) ?? []))
  }
  return result
}
