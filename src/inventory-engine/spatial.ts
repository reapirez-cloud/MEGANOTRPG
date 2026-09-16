import type { InventoryItem } from "../types/characterSheet.ts"
import { inventoryHolderProblem } from "./holders.ts"
import {
  readInventoryProfile,
  type InventoryPhysicalProfile,
} from "./profile.ts"

export type InventorySpatialPlacementKind = "root" | "grid" | "hand" | "external"

export type InventoryPlacementTarget =
  | { kind: "root" }
  | { kind: "hand"; index: 0 | 1 }
  | { kind: "external"; index: number }
  | {
      kind: "grid"
      holderItemId: string
      gridX: number
      gridY: number
      rotation: 0 | 90 | 180 | 270
    }

export type InventoryShapeCell = { x: number; y: number }

export type InventoryRotatedShape = {
  cells: InventoryShapeCell[]
  width: number
  height: number
}

const legacyItemProfile: InventoryPhysicalProfile = {
  semantic_role: "legacy.item",
  packing_mode: "instance",
  footprint_mode: "compact_1x1",
  shape_mask: ["1"],
  shape_width: 1,
  shape_height: 1,
  rotatable: false,
  stack_max: null,
}

const legacyContainerProfile: InventoryPhysicalProfile = {
  ...legacyItemProfile,
  semantic_role: "container.legacy",
  container_profile: {
    internal_grid_width: 6,
    internal_grid_height: 6,
    cell_size_cm: 5,
    allow_nested_containers: true,
    external_carry_slots: 0,
    specialized_capacity: [],
  },
}

export function inventoryPhysicalProfile(item: InventoryItem): InventoryPhysicalProfile {
  return readInventoryProfile(item.inventory_profile)
    || (item.category === "container" ? legacyContainerProfile : legacyItemProfile)
}

export function inventoryPlacementKind(item: InventoryItem) {
  if (item.placement_kind) return item.placement_kind
  return item.holder_item_id ? "legacy" : "root"
}

export function rotateInventoryShape(
  profile: InventoryPhysicalProfile,
  rotation: 0 | 90 | 180 | 270,
): InventoryRotatedShape {
  const effectiveRotation = rotation !== 0 && !profile.rotatable ? 0 : rotation
  const cells: InventoryShapeCell[] = []

  for (let y = 0; y < profile.shape_height; y += 1) {
    const row = profile.shape_mask[y] || ""
    for (let x = 0; x < profile.shape_width; x += 1) {
      if (row[x] !== "1") continue
      if (effectiveRotation === 0) cells.push({ x, y })
      else if (effectiveRotation === 90) cells.push({ x: profile.shape_height - 1 - y, y: x })
      else if (effectiveRotation === 180) cells.push({ x: profile.shape_width - 1 - x, y: profile.shape_height - 1 - y })
      else cells.push({ x: y, y: profile.shape_width - 1 - x })
    }
  }

  const width = cells.reduce((max, cell) => Math.max(max, cell.x + 1), 0)
  const height = cells.reduce((max, cell) => Math.max(max, cell.y + 1), 0)
  return { cells, width, height }
}

export function inventoryExternalCarryCapacity(items: readonly InventoryItem[]) {
  return items.reduce((total, item) => {
    const profile = inventoryPhysicalProfile(item)
    const provider = item.equipped
      || (item.category === "container" && inventoryPlacementKind(item) === "root")
    if (!provider) return total
    return total + Math.max(0, profile.container_profile?.external_carry_slots || 0)
  }, 0)
}

export function inventoryPlacementProblem(
  items: readonly InventoryItem[],
  item: InventoryItem,
  target: InventoryPlacementTarget,
): string | null {
  if (target.kind === "root") return null

  if (target.kind === "hand") {
    if (target.index !== 0 && target.index !== 1) return "Недопустимая ячейка руки."
    const occupied = items.some((other) =>
      other.id !== item.id
      && inventoryPlacementKind(other) === "hand"
      && other.placement_index === target.index
    )
    return occupied ? "Рука уже занята." : null
  }

  if (target.kind === "external") {
    if (!Number.isInteger(target.index) || target.index < 0) return "Недопустимая внешняя ячейка."
    if (target.index >= inventoryExternalCarryCapacity(items)) return "Внешняя ячейка недоступна."
    const occupied = items.some((other) =>
      other.id !== item.id
      && inventoryPlacementKind(other) === "external"
      && other.placement_index === target.index
    )
    return occupied ? "Внешняя ячейка уже занята." : null
  }

  const holder = items.find((candidate) => candidate.id === target.holderItemId)
  if (!holder) return "Контейнер не найден."
  const holderProblem = inventoryHolderProblem(items, item, target.holderItemId)
  if (holderProblem) return "Этот контейнер нельзя использовать для предмета."

  const holderProfile = inventoryPhysicalProfile(holder)
  const container = holderProfile.container_profile
  if (!container) return "У контейнера нет физической сетки."
  if (item.category === "container" && container.allow_nested_containers === false) {
    return "Этот контейнер не принимает вложенные контейнеры."
  }

  const profile = inventoryPhysicalProfile(item)
  if (target.rotation !== 0 && !profile.rotatable) return "Предмет нельзя вращать."
  if (
    !Number.isInteger(target.gridX)
    || !Number.isInteger(target.gridY)
    || target.gridX < 0
    || target.gridY < 0
  ) {
    return "Некорректные координаты."
  }

  const shape = rotateInventoryShape(profile, target.rotation)
  if (
    target.gridX + shape.width > container.internal_grid_width
    || target.gridY + shape.height > container.internal_grid_height
  ) {
    return "Предмет не помещается в границы контейнера."
  }

  const wanted = new Set(
    shape.cells.map((cell) => (target.gridX + cell.x) + ":" + (target.gridY + cell.y)),
  )
  for (const other of items) {
    if (other.id === item.id) continue
    if (other.holder_item_id !== holder.id || inventoryPlacementKind(other) !== "grid") continue
    if (other.grid_x == null || other.grid_y == null) continue
    const otherShape = rotateInventoryShape(
      inventoryPhysicalProfile(other),
      (other.grid_rotation || 0) as 0 | 90 | 180 | 270,
    )
    for (const cell of otherShape.cells) {
      if (wanted.has((other.grid_x + cell.x) + ":" + (other.grid_y + cell.y))) {
        return "Место занято другим предметом."
      }
    }
  }

  return null
}

export function firstAvailableGridPlacement(
  items: readonly InventoryItem[],
  item: InventoryItem,
  holder: InventoryItem,
): Extract<InventoryPlacementTarget, { kind: "grid" }> | null {
  const container = inventoryPhysicalProfile(holder).container_profile
  if (!container) return null

  const profile = inventoryPhysicalProfile(item)
  const rotations: Array<0 | 90 | 180 | 270> = profile.rotatable
    ? [0, 90, 180, 270]
    : [0]

  for (const rotation of rotations) {
    const shape = rotateInventoryShape(profile, rotation)
    for (let y = 0; y <= container.internal_grid_height - shape.height; y += 1) {
      for (let x = 0; x <= container.internal_grid_width - shape.width; x += 1) {
        const target = {
          kind: "grid" as const,
          holderItemId: holder.id,
          gridX: x,
          gridY: y,
          rotation,
        }
        if (!inventoryPlacementProblem(items, item, target)) return target
      }
    }
  }
  return null
}

export function firstFreeHand(items: readonly InventoryItem[]): 0 | 1 | null {
  for (const index of [0, 1] as const) {
    if (!items.some((item) =>
      inventoryPlacementKind(item) === "hand"
      && item.placement_index === index
    )) return index
  }
  return null
}

export function firstFreeExternalSlot(items: readonly InventoryItem[]): number | null {
  const capacity = inventoryExternalCarryCapacity(items)
  for (let index = 0; index < capacity; index += 1) {
    if (!items.some((item) =>
      inventoryPlacementKind(item) === "external"
      && item.placement_index === index
    )) return index
  }
  return null
}
