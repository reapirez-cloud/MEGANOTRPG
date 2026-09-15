import type { SupabaseClient } from "@supabase/supabase-js"
import { EngineCommandError } from "../engine-contracts/index.ts"
import type { InventoryInput, InventoryItem, ItemUsageMode } from "../types/characterSheet.ts"
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
  throw new EngineCommandError("inventory.persistence", message)
}

function usageMode(input: InventoryInput): ItemUsageMode {
  return input.usage_mode ?? (input.category === "consumable" ? "quantity" : "none")
}

function normalizeItem(value: unknown): InventoryItem {
  const row = value as InventoryItem
  const mode = row.usage_mode ?? (row.category === "consumable" ? "quantity" : "none")
  return {
    ...row,
    definition_id: row.definition_id ?? null,
    definition_revision: row.definition_revision ?? null,
    usage_mode: mode,
    charges_current: row.charges_current ?? null,
    charges_max: row.charges_max ?? null,
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
    return (data || []).map(normalizeItem)
  }

  async getItem(itemId: string): Promise<InventoryItem | null> {
    const { data, error } = await this.client
      .from("character_inventory_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle()

    if (error) fail(error, "Could not load inventory item")
    return data ? normalizeItem(data) : null
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
      const { data, error } = await this.client.rpc("set_inventory_item_equipped_v1", {
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