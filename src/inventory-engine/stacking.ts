import type {
  InventoryCategory,
  InventoryInput,
  InventoryItem,
  InventoryStackMode,
  ItemUsageMode,
} from "../types/characterSheet.ts"

type StackPolicySource = Pick<
  InventoryInput,
  "category" | "usage_mode" | "stack_mode" | "quantity"
> | Pick<
  InventoryItem,
  "category" | "usage_mode" | "stack_mode" | "quantity"
>

const forcedInstanceCategories = new Set<InventoryCategory>([
  "equipment",
  "container",
  "quest",
])

export function inventoryUsageMode(
  input: Pick<StackPolicySource, "category" | "usage_mode">,
): ItemUsageMode {
  return input.usage_mode ?? (input.category === "consumable" ? "quantity" : "none")
}

export function forcedInventoryInstanceReason(
  input: Pick<StackPolicySource, "category" | "usage_mode">,
): string | null {
  if (inventoryUsageMode(input) === "charges") return "charged"
  if (forcedInstanceCategories.has(input.category)) return input.category
  return null
}

export function isForcedInventoryInstance(
  input: Pick<StackPolicySource, "category" | "usage_mode">,
): boolean {
  return forcedInventoryInstanceReason(input) !== null
}

export function inventoryStackMode(
  input: Pick<StackPolicySource, "category" | "usage_mode" | "stack_mode">,
): InventoryStackMode {
  if (isForcedInventoryInstance(input)) return "instance"
  return input.stack_mode === "instance" ? "instance" : "stack"
}

export function inventoryStackQuantityValid(
  input: Pick<StackPolicySource, "category" | "usage_mode" | "stack_mode" | "quantity">,
): boolean {
  return inventoryStackMode(input) === "stack" || input.quantity === 1
}
