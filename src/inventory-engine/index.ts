export { CheburashkaEngine, type CheburashkaDependencies } from "./engine.ts"
export { MemoryCheburashkaStorage } from "./memory.ts"
export { SupabaseCheburashkaStorage } from "./supabase.ts"
export {
  createInventoryMechanicalProjection,
  inventoryItemIdFromSourceId,
} from "./projection.ts"
export { subscribeCheburashkaCharacterChanges } from "./realtime.ts"
export {
  createInventoryLoadProjection,
  inventorySpecializedCapacityProblem,
  inventorySpecializedCapacityUsage,
  inventoryUnitWeightKg,
  type InventorySpecializedCapacityUsage,
} from "./load.ts"
export {
  defaultInventoryProfile,
  inventoryProfileStackMode,
  readInventoryProfile,
} from "./profile.ts"
export type {
  InventoryContainerProfile,
  InventoryFootprintMode,
  InventoryPackingMode,
  InventoryPhysicalProfile,
  InventorySpecializedCapacity,
} from "./profile.ts"
export {
  STANDARD_CONTAINER_PROFILE_PRESETS,
  STANDARD_ITEM_PROFILE_PRESETS,
  cloneInventoryProfile,
  inventoryProfilePreset,
} from "./profilePresets.ts"
export type { InventoryProfilePreset } from "./profilePresets.ts"
export {
  firstAvailableGridPlacement,
  firstFreeExternalSlot,
  firstFreeHand,
  inventoryExternalCarryCapacity,
  inventoryPhysicalProfile,
  inventoryPlacementKind,
  inventoryPlacementProblem,
  rotateInventoryShape,
} from "./spatial.ts"
export type {
  InventoryPlacementTarget,
  InventoryRotatedShape,
  InventoryShapeCell,
  InventorySpatialPlacementKind,
} from "./spatial.ts"
export {
  inventoryChildren,
  inventoryContainerTargets,
  inventoryHolder,
  inventoryHolderProblem,
  inventorySubtreeIds,
  sameInventoryOwnerScope,
} from "./holders.ts"
export {
  forcedInventoryInstanceReason,
  inventoryStackMode,
  inventoryStackQuantityValid,
  inventoryUsageMode,
  isForcedInventoryInstance,
} from "./stacking.ts"
export type {
  CheburashkaCommand,
  CheburashkaStorage,
  InventoryLoadProjection,
  InventoryMechanicalProjection,
  InventoryMutation,
} from "./types.ts"
