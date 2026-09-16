import type { SupabaseClient } from "@supabase/supabase-js"
import { EngineCommandError } from "../engine-contracts/index.ts"
import type { InventoryInput, InventoryItem, ItemUsageMode } from "../types/characterSheet.ts"
import { inventoryStackMode } from "./stacking.ts"
import type {
  CheburashkaCommand,
  CheburashkaStorage,
  InventoryItemChange,
  InventoryMutation,
} from "./types.ts"

type JsonRecord = Record<string, unknown>

function fail(error: { message: string } | null, fallback: string): never {
  const message = error?.message || fallback
  if (message.includes("Inventory version conflict")) {
    throw new EngineCommandError("inventory.version_conflict", message)
  }
  if (message.includes("Inventory item not found")) {
    throw new EngineCommandError("inventory.not_found", message)
  }
  if (message.includes("Inventory item is not usable")) {
    throw new EngineCommandError("inventory.not_usable", message)
  }
  if (message.includes("Not enough item charges")) {
    throw new EngineCommandError("inventory.insufficient_charges", message)
  }
  if (message.includes("Not enough item quantity")) {
    throw new EngineCommandError("inventory.insufficient_quantity", message)
  }
  if (message.includes("Inventory instance quantity must be 1")) {
    throw new EngineCommandError("inventory.instance_quantity", message)
  }
  if (message.includes("Inventory instance cannot be split")) {
    throw new EngineCommandError("inventory.instance_split_forbidden", message)
  }
  if (message.includes("Inventory container is not empty") || message.includes("character_inventory_items_holder_item_id_fkey")) {
    throw new EngineCommandError("inventory.container_not_empty", message)
  }
  if (message.includes("Inventory holder must be a container")) {
    throw new EngineCommandError("inventory.holder_not_container", message)
  }
  if (message.includes("Inventory holder must belong to the same character")) {
    throw new EngineCommandError("inventory.holder_different_character", message)
  }
  if (message.includes("Inventory holder not found")) {
    throw new EngineCommandError("inventory.holder_missing", message)
  }
  if (message.includes("Inventory container cycle is not allowed") || message.includes("Inventory item cannot contain itself")) {
    throw new EngineCommandError("inventory.holder_cycle", message)
  }
  if (message.includes("Inventory container nesting depth exceeds 16")) {
    throw new EngineCommandError("inventory.holder_depth", message)
  }
  if (message.includes("Inventory placement is out of bounds")) {
    throw new EngineCommandError("inventory.out_of_bounds", message)
  }
  if (message.includes("Inventory placement overlaps another item")) {
    throw new EngineCommandError("inventory.overlap", message)
  }
  if (message.includes("Inventory hand slot is occupied")) {
    throw new EngineCommandError("inventory.hand_occupied", message)
  }
  if (message.includes("External carry slot is unavailable")) {
    throw new EngineCommandError("inventory.external_unavailable", message)
  }
  if (message.includes("External carry slot is occupied")) {
    throw new EngineCommandError("inventory.external_occupied", message)
  }
  if (message.includes("Inventory item is not rotatable")) {
    throw new EngineCommandError("inventory.rotation_forbidden", message)
  }
  if (message.includes("Equipment slot is occupied")) {
    throw new EngineCommandError("inventory.equipment_slot_occupied", message)
  }
  if (message.includes("Inventory holder does not allow nested containers")) {
    throw new EngineCommandError("inventory.nesting_forbidden", message)
  }
  throw new EngineCommandError("inventory.persistence", message)
}

function usageMode(input: InventoryInput): ItemUsageMode {
  return input.usage_mode ?? (input.category === "consumable" ? "quantity" : "none")
}

function normalizeItem(value: unknown, inventoryProfile: unknown = null): InventoryItem {
  const row = value as InventoryItem
  const mode = row.usage_mode ?? (row.category === "consumable" ? "quantity" : "none")
  return {
    ...row,
    definition_id: row.definition_id ?? null,
    definition_revision: row.definition_revision ?? null,
    usage_mode: mode,
    charges_current: row.charges_current ?? null,
    charges_max: row.charges_max ?? null,
    stack_mode: inventoryStackMode(row),
    holder_item_id: row.holder_item_id ?? null,
    placement_kind: row.placement_kind ?? (row.holder_item_id ? "legacy" : "root"),
    placement_index: row.placement_index ?? null,
    grid_x: row.grid_x ?? null,
    grid_y: row.grid_y ?? null,
    grid_rotation: ([0, 90, 180, 270].includes(Number(row.grid_rotation))
      ? Number(row.grid_rotation)
      : 0) as 0 | 90 | 180 | 270,
    inventory_profile: inventoryProfile && typeof inventoryProfile === "object"
      ? inventoryProfile as Record<string, unknown>
      : row.inventory_profile ?? null,
    item_state: row.item_state && typeof row.item_state === "object" ? row.item_state : {},
    version: Number(row.version ?? 0),
  }
}

function persistencePayload(input: InventoryInput): JsonRecord {
  const mode = usageMode(input)
  const max = mode === "charges" ? Math.max(1, Number(input.charges_max ?? 1)) : null
  const current = mode === "charges"
    ? Math.max(0, Math.min(max!, Number(input.charges_current ?? max)))
    : null

  return {
    name: input.name.trim(),
    quantity: input.quantity,
    weight: input.weight,
    equipped: input.category === "equipment" ? input.equipped : false,
    category: input.category,
    equipment_slot: input.category === "equipment" ? input.equipment_slot : null,
    image_url: input.image_url?.trim() || null,
    description: input.description.trim(),
    definition_id: input.definition_id ?? null,
    definition_revision: input.definition_revision ?? null,
    mechanics: input.mechanics ?? [],
    usage_mode: mode,
    charges_current: current,
    charges_max: max,
    stack_mode: inventoryStackMode({ ...input, usage_mode: mode }),
    item_state: input.item_state ?? {},
  }
}

function changeFromRpc(value: unknown): InventoryItemChange | null {
  if (!value || typeof value !== "object") return null
  const row = value as JsonRecord
  if (!row.before || !row.after) return null
  return {
    before: normalizeItem(row.before),
    after: normalizeItem(row.after),
  }
}

function mutationFromRpc(
  kind: CheburashkaCommand["kind"],
  data: unknown,
): InventoryMutation {
  const result = (data || {}) as JsonRecord
  const before = result.before ? normalizeItem(result.before) : null
  const after = result.after ? normalizeItem(result.after) : null
  const destinationItem = result.destinationItem
    ? normalizeItem(result.destinationItem)
    : null
  const relatedChanges = Array.isArray(result.relatedChanges)
    ? result.relatedChanges
        .map(changeFromRpc)
        .filter((change): change is InventoryItemChange => Boolean(change))
    : []

  const affected = Array.isArray(result.affectedCharacterIds)
    ? result.affectedCharacterIds.map(String)
    : [
        before?.character_id,
        after?.character_id,
        destinationItem?.character_id,
      ].filter((id): id is string => Boolean(id))

  return {
    kind,
    itemId: String(
      result.itemId ||
        before?.id ||
        after?.id ||
        destinationItem?.id ||
        "",
    ),
    affectedCharacterIds: [...new Set(affected)],
    before,
    after,
    ...(destinationItem ? { destinationItem } : {}),
    ...(relatedChanges.length ? { relatedChanges } : {}),
  }
}

export class SupabaseCheburashkaStorage implements CheburashkaStorage {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async listCharacterItems(characterId: string): Promise<InventoryItem[]> {
    const { data, error } = await this.client
      .from("character_inventory_items")
      .select("*")
      .eq("character_id", characterId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) fail(error, "Could not load inventory")
    const rows = data || []
    const definitionIds = [...new Set(
      rows
        .map((row) => String(row.definition_id || ""))
        .filter(Boolean),
    )]
    const profiles = new Map<string, unknown>()

    if (definitionIds.length) {
      const { data: revisions, error: revisionsError } = await this.client
        .from("reference_definition_revisions")
        .select("definition_id,revision,data")
        .in("definition_id", definitionIds)

      if (revisionsError) fail(revisionsError, "Could not load inventory profiles")
      for (const revision of revisions || []) {
        const definitionData = revision.data && typeof revision.data === "object"
          ? revision.data as JsonRecord
          : {}
        profiles.set(
          String(revision.definition_id) + ":" + String(revision.revision),
          definitionData.inventory_profile ?? null,
        )
      }
    }

    return rows.map((row) => normalizeItem(
      row,
      row.definition_id && row.definition_revision
        ? profiles.get(String(row.definition_id) + ":" + String(row.definition_revision)) ?? null
        : null,
    ))
  }

  async getItem(itemId: string): Promise<InventoryItem | null> {
    const { data, error } = await this.client
      .from("character_inventory_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle()

    if (error) fail(error, "Could not load inventory item")
    if (!data) return null

    let inventoryProfile: unknown = null
    if (data.definition_id && data.definition_revision) {
      const { data: revision, error: revisionError } = await this.client
        .from("reference_definition_revisions")
        .select("data")
        .eq("definition_id", data.definition_id)
        .eq("revision", data.definition_revision)
        .maybeSingle()
      if (revisionError) fail(revisionError, "Could not load inventory profile")
      const definitionData = revision?.data && typeof revision.data === "object"
        ? revision.data as JsonRecord
        : {}
      inventoryProfile = definitionData.inventory_profile ?? null
    }

    return normalizeItem(data, inventoryProfile)
  }

  private async expectedVersion(
    itemId: string,
    characterId: string,
    provided?: number,
  ): Promise<number> {
    if (provided !== undefined) return provided

    const item = await this.getItem(itemId)
    if (!item || item.character_id !== characterId) {
      throw new EngineCommandError(
        "inventory.not_found",
        "Inventory item was not found for this character",
      )
    }

    const version = Number(item.version ?? 0)
    if (!Number.isInteger(version) || version < 1) {
      throw new EngineCommandError(
        "inventory.invalid_version",
        "Inventory item has no valid version",
      )
    }
    return version
  }

  async execute(command: CheburashkaCommand): Promise<InventoryMutation> {
    if (command.kind === "inventory.create") {
      const { data, error } = await this.client.rpc("create_inventory_item_v1", {
        p_character_id: command.characterId,
        p_input: persistencePayload(command.input),
        p_command_id: command.context.commandId,
      })

      if (error) fail(error, "Could not create inventory item")
      return mutationFromRpc(command.kind, data)
    }

    if (command.kind === "inventory.update") {
      const expectedVersion = await this.expectedVersion(
        command.itemId,
        command.characterId,
        command.expectedVersion,
      )
      const { data, error } = await this.client.rpc("update_inventory_item_v1", {
        p_character_id: command.characterId,
        p_item_id: command.itemId,
        p_input: persistencePayload(command.input),
        p_expected_version: expectedVersion,
        p_command_id: command.context.commandId,
      })

      if (error) fail(error, "Could not update inventory item")
      return mutationFromRpc(command.kind, data)
    }

    if (command.kind === "inventory.remove") {
      const expectedVersion = await this.expectedVersion(
        command.itemId,
        command.characterId,
        command.expectedVersion,
      )
      const { data, error } = await this.client.rpc("remove_inventory_item_v1", {
        p_character_id: command.characterId,
        p_item_id: command.itemId,
        p_expected_version: expectedVersion,
        p_command_id: command.context.commandId,
      })

      if (error) fail(error, "Could not delete inventory item")
      return mutationFromRpc(command.kind, data)
    }

    if (command.kind === "inventory.set_equipped") {
      const expectedVersion = await this.expectedVersion(
        command.itemId,
        command.characterId,
        command.expectedVersion,
      )
      const { data, error } = await this.client.rpc("set_inventory_item_equipped_v2", {
        p_character_id: command.characterId,
        p_item_id: command.itemId,
        p_equipped: command.equipped,
        p_equipment_slot: command.equipmentSlot,
        p_expected_version: expectedVersion,
        p_command_id: command.context.commandId,
      })

      if (error) fail(error, "Could not change equipment")
      return mutationFromRpc(command.kind, data)
    }

    if (command.kind === "inventory.consume") {
      const expectedVersion = await this.expectedVersion(
        command.itemId,
        command.characterId,
        command.expectedVersion,
      )
      const { data, error } = await this.client.rpc("consume_inventory_item_v2", {
        p_character_id: command.characterId,
        p_item_id: command.itemId,
        p_amount: command.amount,
        p_expected_version: expectedVersion,
        p_command_id: command.context.commandId,
      })

      if (error) fail(error, "Could not consume inventory item")
      return mutationFromRpc(command.kind, data)
    }

    if (command.kind === "inventory.move") {
      const expectedVersion = await this.expectedVersion(
        command.itemId,
        command.characterId,
        command.expectedVersion,
      )

      if (command.placement) {
        const placement = command.placement
        const { data, error } = await this.client.rpc("move_inventory_item_v2", {
          p_character_id: command.characterId,
          p_item_id: command.itemId,
          p_target_kind: placement.kind,
          p_holder_item_id: placement.kind === "grid" ? placement.holderItemId : null,
          p_grid_x: placement.kind === "grid" ? placement.gridX : null,
          p_grid_y: placement.kind === "grid" ? placement.gridY : null,
          p_rotation: placement.kind === "grid" ? placement.rotation : 0,
          p_slot_index: placement.kind === "hand" || placement.kind === "external"
            ? placement.index
            : null,
          p_expected_version: expectedVersion,
          p_command_id: command.context.commandId,
        })
        if (error) fail(error, "Could not place inventory item")
        return mutationFromRpc(command.kind, data)
      }

      const { data, error } = await this.client.rpc("move_inventory_item_v1", {
        p_character_id: command.characterId,
        p_item_id: command.itemId,
        p_holder_item_id: command.holderItemId,
        p_expected_version: expectedVersion,
        p_command_id: command.context.commandId,
      })

      if (error) fail(error, "Could not move inventory item")
      return mutationFromRpc(command.kind, data)
    }

    const expectedVersion = await this.expectedVersion(
      command.itemId,
      command.fromCharacterId,
      command.expectedVersion,
    )
    const { data, error } = await this.client.rpc("transfer_inventory_item_v2", {
      p_from_character_id: command.fromCharacterId,
      p_to_character_id: command.toCharacterId,
      p_item_id: command.itemId,
      p_amount: command.amount,
      p_expected_version: expectedVersion,
      p_command_id: command.context.commandId,
    })

    if (error) fail(error, "Could not transfer inventory item")
    return mutationFromRpc(command.kind, data)
  }
}