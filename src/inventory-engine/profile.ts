import type {
  InventoryInput,
  InventoryStackMode,
} from "../types/characterSheet.ts"

export type InventoryPackingMode = "instance" | "bulk_stack"
export type InventoryFootprintMode = "compact_1x1" | "shape"

export type InventorySpecializedCapacity = {
  semantic_role: string
  max_quantity: number
}

export type InventoryContainerProfile = {
  internal_grid_width: number
  internal_grid_height: number
  cell_size_cm: number
  allow_nested_containers?: boolean
  external_carry_slots?: number | null
  specialized_capacity?: InventorySpecializedCapacity[]
}

export type InventoryPhysicalProfile = {
  semantic_role: string
  packing_mode: InventoryPackingMode
  footprint_mode: InventoryFootprintMode
  shape_mask: string[]
  shape_width: number
  shape_height: number
  rotatable: boolean
  stack_max: number | null
  physical_dimensions_cm?: {
    width?: number
    height?: number
    depth?: number
  } | null
  weight_per_unit?: number | null
  base_value_cp?: number | null
  container_profile?: InventoryContainerProfile | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function positiveInteger(value: unknown, max: number): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : null
}

function nonNegativeInteger(value: unknown, max: number): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : null
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function readContainerProfile(value: unknown): InventoryContainerProfile | null {
  const source = record(value)
  if (!source) return null
  const internalGridWidth = positiveInteger(source.internal_grid_width, 100)
  const internalGridHeight = positiveInteger(source.internal_grid_height, 100)
  const cellSize = Number(source.cell_size_cm)
  if (!internalGridWidth || !internalGridHeight || !Number.isFinite(cellSize) || cellSize <= 0 || cellSize > 100) {
    return null
  }

  const specialized = Array.isArray(source.specialized_capacity)
    ? source.specialized_capacity.map((entry) => {
        const row = record(entry)
        const semanticRole = typeof row?.semantic_role === "string" ? row.semantic_role.trim() : ""
        const maxQuantity = positiveInteger(row?.max_quantity, 100000)
        return semanticRole && maxQuantity
          ? { semantic_role: semanticRole, max_quantity: maxQuantity }
          : null
      }).filter((entry): entry is InventorySpecializedCapacity => Boolean(entry))
    : undefined

  if (Array.isArray(source.specialized_capacity) && specialized?.length !== source.specialized_capacity.length) return null

  const externalCarrySlots = source.external_carry_slots === undefined
    ? undefined
    : nonNegativeInteger(source.external_carry_slots, 50)
  if (source.external_carry_slots !== undefined && externalCarrySlots === null) return null
  if (source.allow_nested_containers !== undefined && typeof source.allow_nested_containers !== "boolean") return null

  return {
    internal_grid_width: internalGridWidth,
    internal_grid_height: internalGridHeight,
    cell_size_cm: cellSize,
    ...(source.allow_nested_containers === undefined ? {} : { allow_nested_containers: source.allow_nested_containers }),
    ...(externalCarrySlots === undefined ? {} : { external_carry_slots: externalCarrySlots }),
    ...(specialized === undefined ? {} : { specialized_capacity: specialized }),
  }
}

export function readInventoryProfile(value: unknown): InventoryPhysicalProfile | null {
  const source = record(value)
  if (!source) return null
  const semanticRole = typeof source.semantic_role === "string" ? source.semantic_role.trim() : ""
  const packingMode = source.packing_mode === "bulk_stack" ? "bulk_stack" : source.packing_mode === "instance" ? "instance" : null
  const footprintMode = source.footprint_mode === "shape" ? "shape" : source.footprint_mode === "compact_1x1" ? "compact_1x1" : null
  const shapeWidth = positiveInteger(source.shape_width, 80)
  const shapeHeight = positiveInteger(source.shape_height, 80)
  const shapeMask = Array.isArray(source.shape_mask) && source.shape_mask.every((row) => typeof row === "string")
    ? source.shape_mask as string[]
    : null

  if (!semanticRole || semanticRole.length > 80 || !packingMode || !footprintMode || !shapeWidth || !shapeHeight || typeof source.rotatable !== "boolean" || !shapeMask || shapeMask.length !== shapeHeight || !shapeMask.some((row) => row.includes("1")) || shapeMask.some((row) => row.length !== shapeWidth || !/^[01]+$/.test(row))) return null
  if (footprintMode === "compact_1x1" && (shapeWidth !== 1 || shapeHeight !== 1 || shapeMask[0] !== "1")) return null

  let stackMax: number | null = null
  if (packingMode === "bulk_stack") {
    stackMax = positiveInteger(source.stack_max, 100000)
    if (!stackMax || stackMax < 2 || footprintMode !== "compact_1x1") return null
  } else if (source.stack_max !== undefined && source.stack_max !== null) return null

  const dimensions = record(source.physical_dimensions_cm)
  const parsedDimensions = dimensions
    ? Object.fromEntries(["width","height","depth"].filter((key) => dimensions[key] !== undefined).map((key) => [key, Number(dimensions[key])])) as InventoryPhysicalProfile["physical_dimensions_cm"]
    : null
  if (dimensions && Object.values(parsedDimensions || {}).some((entry) => !Number.isFinite(entry) || Number(entry) <= 0)) return null

  const weightPerUnit = source.weight_per_unit == null ? null : finiteNonNegative(source.weight_per_unit)
  if (source.weight_per_unit != null && weightPerUnit === null) return null
  const baseValueCp = source.base_value_cp == null ? null : nonNegativeInteger(source.base_value_cp, Number.MAX_SAFE_INTEGER)
  if (source.base_value_cp != null && baseValueCp === null) return null
  const containerProfile = source.container_profile == null ? null : readContainerProfile(source.container_profile)
  if (source.container_profile != null && !containerProfile) return null

  return {
    semantic_role: semanticRole,
    packing_mode: packingMode,
    footprint_mode: footprintMode,
    shape_mask: [...shapeMask],
    shape_width: shapeWidth,
    shape_height: shapeHeight,
    rotatable: source.rotatable,
    stack_max: stackMax,
    ...(dimensions ? { physical_dimensions_cm: parsedDimensions } : {}),
    ...(source.weight_per_unit === undefined ? {} : { weight_per_unit: weightPerUnit }),
    ...(source.base_value_cp === undefined ? {} : { base_value_cp: baseValueCp }),
    ...(source.container_profile === undefined ? {} : { container_profile: containerProfile }),
  }
}

export function inventoryProfileStackMode(profile: Pick<InventoryPhysicalProfile, "packing_mode">): InventoryStackMode {
  return profile.packing_mode === "bulk_stack" ? "stack" : "instance"
}

export function defaultInventoryProfile(
  input: Pick<InventoryInput, "category" | "stack_mode" | "weight">,
  current: InventoryPhysicalProfile | null = null,
): InventoryPhysicalProfile {
  const packingMode: InventoryPackingMode = input.stack_mode === "stack" ? "bulk_stack" : "instance"
  const keepShape = packingMode === "instance" && current?.footprint_mode === "shape"
  return {
    semantic_role: current?.semantic_role || input.category,
    packing_mode: packingMode,
    footprint_mode: keepShape ? "shape" : "compact_1x1",
    shape_mask: keepShape ? [...current.shape_mask] : ["1"],
    shape_width: keepShape ? current.shape_width : 1,
    shape_height: keepShape ? current.shape_height : 1,
    rotatable: keepShape ? current.rotatable : false,
    stack_max: packingMode === "bulk_stack"
      ? current?.packing_mode === "bulk_stack" && current.stack_max ? current.stack_max : 20
      : null,
    ...(current?.physical_dimensions_cm ? { physical_dimensions_cm: { ...current.physical_dimensions_cm } } : {}),
    ...(input.weight == null
      ? current?.weight_per_unit == null ? {} : { weight_per_unit: current.weight_per_unit }
      : { weight_per_unit: input.weight }),
    ...(current?.base_value_cp == null ? {} : { base_value_cp: current.base_value_cp }),
    ...(current?.container_profile ? { container_profile: { ...current.container_profile, specialized_capacity: current.container_profile.specialized_capacity?.map((entry) => ({ ...entry })) } } : {}),
  }
}
