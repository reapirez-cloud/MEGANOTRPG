import { chasovoy } from "../reference-engine/runtime.ts"
import type {
  ChasovoyDefinition,
  ChasovoyJson,
} from "../reference-engine/index.ts"
import type { StoredMechanics } from "../types/characterMechanics"
import type {
  FeatureInput,
  InventoryCategory,
  InventoryInput,
  SpellInput,
} from "../types/characterSheet"

const INVENTORY_CATEGORIES: InventoryCategory[] = [
  "equipment",
  "consumable",
  "tool",
  "book",
  "trinket",
  "quest",
  "material",
  "currency",
  "container",
  "other",
]

export type WorkshopLinkedDefinitionRef = {
  id: string
  revision?: number | null
}

function jsonString(data: Record<string, ChasovoyJson>, key: string, fallback = "") {
  const value = data[key]
  return typeof value === "string" ? value : fallback
}

function jsonNumber(data: Record<string, ChasovoyJson>, key: string, fallback = 0) {
  const value = data[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function jsonBoolean(data: Record<string, ChasovoyJson>, key: string, fallback = false) {
  const value = data[key]
  return typeof value === "boolean" ? value : fallback
}

function definitionWeightKg(definition: ChasovoyDefinition): number | null {
  const rawProfile = definition.data.inventory_profile
  if (rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile)) {
    const weight = (rawProfile as Record<string, ChasovoyJson>).weight_per_unit
    if (typeof weight === "number" && Number.isFinite(weight) && weight >= 0) return weight
  }

  const legacyWeight = definition.data.weight
  return definition.data.weight_unit === "kg"
    && typeof legacyWeight === "number"
    && Number.isFinite(legacyWeight)
    && legacyWeight >= 0
    ? legacyWeight
    : null
}

export function workshopLinkedDefinitionRefs(
  definition: ChasovoyDefinition,
): WorkshopLinkedDefinitionRef[] {
  const raw = definition.data.linked_definitions
  if (Array.isArray(raw)) {
    return raw.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return []
      const record = value as Record<string, ChasovoyJson>
      const id = typeof record.id === "string" ? record.id : ""
      const revision = typeof record.revision === "number" ? record.revision : null
      return id ? [{ id, revision }] : []
    })
  }

  const legacy = definition.data.linked_definition_ids
  return Array.isArray(legacy)
    ? legacy.flatMap((value) =>
        typeof value === "string"
          ? [{ id: value, revision: null }]
          : []
      )
    : []
}

export async function compileWorkshopItemInput(
  definition: ChasovoyDefinition,
  quantityOverride?: number,
): Promise<InventoryInput> {
  const rawCategory = jsonString(definition.data, "category", "other")
  const category = INVENTORY_CATEGORIES.includes(rawCategory as InventoryCategory)
    ? rawCategory as InventoryCategory
    : "other"
  const ownMechanics = Array.isArray(definition.mechanics)
    ? definition.mechanics as unknown as StoredMechanics
    : []
  const refs = workshopLinkedDefinitionRefs(definition)
  const linkedMechanics: StoredMechanics = []

  for (const ref of refs) {
    const linked = await chasovoy.getDefinition({
      id: ref.id,
      revision: ref.revision ?? undefined,
    })
    if (!linked || linked.status === "archived") continue

    if (Array.isArray(linked.mechanics)) {
      linkedMechanics.push(...linked.mechanics as unknown as StoredMechanics)
    }
  }

  return {
    name: definition.name,
    quantity: Math.max(
      1,
      Math.floor(quantityOverride ?? jsonNumber(definition.data, "quantity", 1)),
    ),
    weight: definitionWeightKg(definition),
    equipped: false,
    category,
    equipment_slot: category === "equipment"
      ? (jsonString(definition.data, "equipment_slot") || null) as InventoryInput["equipment_slot"]
      : null,
    image_url: jsonString(definition.data, "image_url") || null,
    description: definition.rulesText || definition.summary,
    definition_id: definition.id,
    definition_revision: definition.revision,
    mechanics: [...ownMechanics, ...linkedMechanics],
    usage_mode: (jsonString(definition.data, "usage_mode", "none") || "none") as InventoryInput["usage_mode"],
    charges_current:
      typeof definition.data.charges_current === "number"
        ? definition.data.charges_current
        : null,
    charges_max:
      typeof definition.data.charges_max === "number"
        ? definition.data.charges_max
        : null,
    item_state: {
      source_definition_id: definition.id,
      source_definition_revision: definition.revision,
      linked_definition_refs: refs,
    },
  }
}

export function workshopSpellInput(definition: ChasovoyDefinition): SpellInput {
  const level = Math.max(
    0,
    Math.min(9, jsonNumber(definition.data, "spell_level", 0)),
  )

  return {
    name: definition.name,
    spell_level: level,
    school: jsonString(definition.data, "school", "Особая"),
    casting_time: jsonString(definition.data, "casting_time", "1 действие"),
    spell_range: jsonString(definition.data, "spell_range", "На себя"),
    duration: jsonString(definition.data, "duration", "Мгновенно"),
    components: jsonString(definition.data, "components", ""),
    concentration: jsonBoolean(definition.data, "concentration"),
    ritual: jsonBoolean(definition.data, "ritual"),
    prepared: false,
    cast_mode: level === 0 ? "cantrip" : "slot",
    slot_level: level === 0 ? null : level,
    description: definition.rulesText || definition.summary,
    source: "GM Library",
  }
}

export function workshopFeatureInput(
  definition: ChasovoyDefinition,
): FeatureInput | null {
  if (
    definition.kind !== "feature" &&
    definition.kind !== "condition" &&
    definition.kind !== "feat"
  ) {
    return null
  }

  const mechanics = Array.isArray(definition.mechanics)
    ? definition.mechanics as unknown as StoredMechanics
    : []

  return {
    kind:
      definition.kind === "condition"
        ? "effect"
        : definition.kind === "feat"
          ? "feat"
          : "feature",
    name: definition.name,
    description: definition.rulesText || definition.summary,
    mechanics,
    source_definition_id: definition.id,
    source_definition_revision: definition.revision,
    source_definition_kind: definition.kind,
  }
}
