import { EngineCommandError } from "../engine-contracts/index.ts"
import type { InventoryInput, InventoryItem, ItemUsageMode } from "../types/characterSheet.ts"
import type { CheburashkaCommand, CheburashkaStorage, InventoryMutation } from "./types.ts"
import {
  inventoryHolderProblem,
  inventorySubtreeIds,
} from "./holders.ts"
import { inventoryStackMode } from "./stacking.ts"
import { inventoryPlacementProblem } from "./spatial.ts"

function copy<T>(value: T): T {
  return structuredClone(value)
}

function usageMode(
  input: Pick<InventoryInput, "usage_mode" | "category">,
): ItemUsageMode {
  return input.usage_mode ?? (input.category === "consumable" ? "quantity" : "none")
}

function normalizeInput(input: InventoryInput) {
  const mode = usageMode(input)
  const chargesMax =
    mode === "charges" ? Math.max(1, input.charges_max ?? 1) : null
  const chargesCurrent =
    mode === "charges"
      ? Math.max(
          0,
          Math.min(chargesMax!, input.charges_current ?? chargesMax!),
        )
      : null

  return {
    ...input,
    name: input.name.trim(),
    usage_mode: mode,
    charges_current: chargesCurrent,
    charges_max: chargesMax,
    stack_mode: inventoryStackMode({ ...input, usage_mode: mode }),
    item_state: copy(input.item_state ?? {}),
  }
}

function receiptKey(command: CheburashkaCommand): string {
  if (command.kind === "inventory.transfer") {
    return [
      command.kind,
      command.fromCharacterId,
      command.toCharacterId,
      command.itemId,
    ].join(":")
  }
  if ("itemId" in command) {
    return [command.kind, command.characterId, command.itemId].join(":")
  }
  return [command.kind, command.characterId].join(":")
}

export class MemoryCheburashkaStorage implements CheburashkaStorage {
  private readonly items = new Map<string, InventoryItem>()
  private readonly receipts = new Map<
    string,
    { key: string; mutation: InventoryMutation }
  >()

  constructor(initial: readonly InventoryItem[] = []) {
    for (const item of initial) this.items.set(item.id, copy(item))
  }

  async listCharacterItems(characterId: string): Promise<InventoryItem[]> {
    return [...this.items.values()]
      .filter((item) => item.character_id === characterId)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at),
      )
      .map(copy)
  }

  async getItem(itemId: string): Promise<InventoryItem | null> {
    const item = this.items.get(itemId)
    return item ? copy(item) : null
  }

  private replay(command: CheburashkaCommand): InventoryMutation | null {
    const receipt = this.receipts.get(command.context.commandId)
    if (!receipt) return null
    if (receipt.key !== receiptKey(command)) {
      throw new EngineCommandError(
        "inventory.command_id_conflict",
        "Command id is already used by another inventory command",
      )
    }
    return copy(receipt.mutation)
  }

  private finish(
    command: CheburashkaCommand,
    mutation: InventoryMutation,
  ): InventoryMutation {
    this.receipts.set(command.context.commandId, {
      key: receiptKey(command),
      mutation: copy(mutation),
    })
    return copy(mutation)
  }

  private owned(itemId: string, characterId: string): InventoryItem {
    const item = this.items.get(itemId)
    if (!item || item.character_id !== characterId) {
      throw new EngineCommandError(
        "inventory.not_found",
        "Inventory item was not found for this character",
      )
    }
    return item
  }

  private assertVersion(item: InventoryItem, expectedVersion?: number): void {
    if (expectedVersion === undefined) return
    const current = Number(item.version ?? 0)
    if (current !== expectedVersion) {
      throw new EngineCommandError(
        "inventory.version_conflict",
        `Inventory version conflict: expected ${expectedVersion}, current ${current}`,
      )
    }
  }

  private stamp(item: InventoryItem): InventoryItem {
    return {
      ...item,
      version: (item.version ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }
  }

  async execute(command: CheburashkaCommand): Promise<InventoryMutation> {
    const replay = this.replay(command)
    if (replay) return replay

    if (command.kind === "inventory.create") {
      const input = normalizeInput(command.input)
      if (!input.name) {
        throw new EngineCommandError(
          "inventory.name_required",
          "Item name is required",
        )
      }
      if (!Number.isInteger(input.quantity) || input.quantity < 1) {
        throw new EngineCommandError(
          "inventory.invalid_quantity",
          "Inventory quantity must be an integer >= 1",
        )
      }
      if (input.stack_mode === "instance" && input.quantity !== 1) {
        throw new EngineCommandError(
          "inventory.instance_quantity",
          "Inventory instance quantity must be 1",
        )
      }

      const item: InventoryItem = {
        id: `item-${command.context.commandId}`,
        character_id: command.characterId,
        name: input.name,
        quantity: input.quantity,
        weight: input.weight,
        equipped: input.category === "equipment" && input.equipped,
        category: input.category,
        equipment_slot:
          input.category === "equipment" ? input.equipment_slot : null,
        image_url: input.image_url,
        description: input.description.trim(),
        definition_id: input.definition_id ?? null,
        definition_revision: input.definition_revision ?? null,
        mechanics: copy(input.mechanics ?? []),
        usage_mode: input.usage_mode,
        charges_current: input.charges_current,
        charges_max: input.charges_max,
        stack_mode: input.stack_mode,
        holder_item_id: null,
        placement_kind: "root",
        placement_index: null,
        grid_x: null,
        grid_y: null,
        grid_rotation: 0,
        item_state: input.item_state,
        version: 1,
        sort_order: 0,
        created_at: command.context.occurredAt,
        updated_at: command.context.occurredAt,
      }
      this.items.set(item.id, item)

      return this.finish(command, {
        kind: command.kind,
        itemId: item.id,
        affectedCharacterIds: [command.characterId],
        before: null,
        after: copy(item),
      })
    }

    if (command.kind === "inventory.transfer") {
      const item = this.owned(command.itemId, command.fromCharacterId)
      this.assertVersion(item, command.expectedVersion)
      const before = copy(item)
      if (command.amount > item.quantity) {
        throw new EngineCommandError(
          "inventory.insufficient_quantity",
          "Not enough items to transfer",
        )
      }
      if (inventoryStackMode(item) === "instance" && command.amount !== item.quantity) {
        throw new EngineCommandError(
          "inventory.instance_split_forbidden",
          "Inventory instance cannot be split",
        )
      }

      let sourceAfter: InventoryItem | null = null
      let destination: InventoryItem
      const relatedChanges = []

      if (command.amount === item.quantity) {
        const allItems = [...this.items.values()]
        const descendantIds = item.category === "container"
          ? inventorySubtreeIds(allItems, item.id)
          : []

        destination = this.stamp({
          ...item,
          character_id: command.toCharacterId,
          holder_item_id: null,
          placement_kind: "root",
          placement_index: null,
          grid_x: null,
          grid_y: null,
          grid_rotation: 0,
          equipped: false,
        })
        this.items.set(item.id, destination)

        for (const descendantId of descendantIds) {
          const descendant = this.items.get(descendantId)
          if (!descendant) continue
          const descendantBefore = copy(descendant)
          const descendantAfter = this.stamp({
            ...descendant,
            character_id: command.toCharacterId,
            equipped: false,
          })
          this.items.set(descendantId, descendantAfter)
          relatedChanges.push({
            before: descendantBefore,
            after: copy(descendantAfter),
          })
        }
      } else {
        sourceAfter = this.stamp({
          ...item,
          quantity: item.quantity - command.amount,
        })
        destination = {
          ...copy(item),
          id: `${item.id}-to-${command.context.commandId}`,
          character_id: command.toCharacterId,
          quantity: command.amount,
          holder_item_id: null,
          placement_kind: "root",
          placement_index: null,
          grid_x: null,
          grid_y: null,
          grid_rotation: 0,
          equipped: false,
          version: 1,
          created_at: command.context.occurredAt,
          updated_at: command.context.occurredAt,
        }
        this.items.set(item.id, sourceAfter)
        this.items.set(destination.id, destination)
      }

      return this.finish(command, {
        kind: command.kind,
        itemId: item.id,
        affectedCharacterIds: [
          command.fromCharacterId,
          command.toCharacterId,
        ],
        before,
        after: sourceAfter ? copy(sourceAfter) : null,
        destinationItem: copy(destination),
        ...(relatedChanges.length ? { relatedChanges } : {}),
      })
    }

    if (command.kind === "inventory.move") {
      const item = this.owned(command.itemId, command.characterId)
      this.assertVersion(item, command.expectedVersion)
      const before = copy(item)
      const allItems = [...this.items.values()]
      const holderItemId = command.placement?.kind === "grid"
        ? command.placement.holderItemId
        : command.holderItemId
      const problem = inventoryHolderProblem(allItems, item, holderItemId)
      if (problem) {
        throw new EngineCommandError(
          `inventory.holder_${problem}`,
          `Invalid inventory holder: ${problem}`,
        )
      }
      if (command.placement) {
        const placementProblem = inventoryPlacementProblem(allItems, item, command.placement)
        if (placementProblem) {
          throw new EngineCommandError("inventory.placement_invalid", placementProblem)
        }
      }

      const placement = command.placement
      const nextState = placement
        ? {
            holder_item_id: placement.kind === "grid" ? placement.holderItemId : null,
            placement_kind: placement.kind,
            placement_index: placement.kind === "hand" || placement.kind === "external"
              ? placement.index
              : null,
            grid_x: placement.kind === "grid" ? placement.gridX : null,
            grid_y: placement.kind === "grid" ? placement.gridY : null,
            grid_rotation: placement.kind === "grid" ? placement.rotation : 0,
            equipped: false,
          }
        : {
            holder_item_id: command.holderItemId,
            placement_kind: command.holderItemId ? "legacy" as const : "root" as const,
            placement_index: null,
            grid_x: null,
            grid_y: null,
            grid_rotation: 0 as const,
            equipped: command.holderItemId ? false : item.equipped,
          }

      const after = this.stamp({ ...item, ...nextState })
      this.items.set(item.id, after)
      return this.finish(command, {
        kind: command.kind,
        itemId: item.id,
        affectedCharacterIds: [command.characterId],
        before,
        after: copy(after),
      })
    }

    const item = this.owned(command.itemId, command.characterId)
    this.assertVersion(item, command.expectedVersion)
    const before = copy(item)

    if (command.kind === "inventory.remove") {
      if ([...this.items.values()].some((child) => (child.holder_item_id ?? null) === item.id)) {
        throw new EngineCommandError(
          "inventory.container_not_empty",
          "Inventory container is not empty",
        )
      }
      this.items.delete(item.id)
      return this.finish(command, {
        kind: command.kind,
        itemId: item.id,
        affectedCharacterIds: [command.characterId],
        before,
        after: null,
      })
    }

    if (command.kind === "inventory.update") {
      const input = normalizeInput(command.input)
      if (input.stack_mode === "instance" && input.quantity !== 1) {
        throw new EngineCommandError(
          "inventory.instance_quantity",
          "Inventory instance quantity must be 1",
        )
      }
      const after = this.stamp({
        ...item,
        ...input,
        definition_id: input.definition_id ?? null,
        definition_revision: input.definition_revision ?? null,
        equipped: input.category === "equipment" && input.equipped,
        equipment_slot:
          input.category === "equipment" ? input.equipment_slot : null,
      })
      this.items.set(item.id, after)

      return this.finish(command, {
        kind: command.kind,
        itemId: item.id,
        affectedCharacterIds: [command.characterId],
        before,
        after: copy(after),
      })
    }

    if (command.kind === "inventory.set_equipped") {
      if (command.equipped && item.category !== "equipment") {
        throw new EngineCommandError(
          "inventory.not_equipment",
          "Only equipment can be equipped",
        )
      }
      if (command.equipped && !command.equipmentSlot) {
        throw new EngineCommandError(
          "inventory.slot_required",
          "Equipment slot is required",
        )
      }

      const relatedChanges = []
      if (command.equipped) {
        for (const other of this.items.values()) {
          if (
            other.id === item.id ||
            other.character_id !== item.character_id ||
            !other.equipped
          ) {
            continue
          }

          const sameSlot = other.equipment_slot === command.equipmentSlot
          const handConflict =
            command.equipmentSlot === "two_hands"
              ? other.equipment_slot === "main_hand" ||
                other.equipment_slot === "off_hand"
              : (command.equipmentSlot === "main_hand" ||
                    command.equipmentSlot === "off_hand") &&
                other.equipment_slot === "two_hands"

          if (!sameSlot && !handConflict) continue

          const displacedBefore = copy(other)
          const displacedAfter = this.stamp({
            ...other,
            equipped: false,
          })
          this.items.set(other.id, displacedAfter)
          relatedChanges.push({
            before: displacedBefore,
            after: copy(displacedAfter),
          })
        }
      }

      const after = this.stamp({
        ...item,
        equipped: command.equipped,
        equipment_slot: command.equipmentSlot ?? item.equipment_slot,
        ...(command.equipped ? {
          holder_item_id: null,
          placement_kind: "root" as const,
          placement_index: null,
          grid_x: null,
          grid_y: null,
          grid_rotation: 0 as const,
        } : {}),
      })
      this.items.set(item.id, after)

      return this.finish(command, {
        kind: command.kind,
        itemId: item.id,
        affectedCharacterIds: [command.characterId],
        before,
        after: copy(after),
        ...(relatedChanges.length ? { relatedChanges } : {}),
      })
    }

    const mode =
      item.usage_mode ??
      (item.category === "consumable" ? "quantity" : "none")

    if (mode === "none") {
      throw new EngineCommandError(
        "inventory.not_usable",
        "Inventory item is not usable",
      )
    }

    if (mode === "charges") {
      const current =
        item.charges_current ?? item.charges_max ?? 0
      if (current < command.amount) {
        throw new EngineCommandError(
          "inventory.insufficient_charges",
          "Not enough item charges",
        )
      }
      const after = this.stamp({
        ...item,
        charges_current: current - command.amount,
      })
      this.items.set(item.id, after)

      return this.finish(command, {
        kind: command.kind,
        itemId: item.id,
        affectedCharacterIds: [command.characterId],
        before,
        after: copy(after),
      })
    }

    if (item.quantity < command.amount) {
      throw new EngineCommandError(
        "inventory.insufficient_quantity",
        "Not enough item quantity",
      )
    }

    if (item.quantity === command.amount) {
      this.items.delete(item.id)
      return this.finish(command, {
        kind: command.kind,
        itemId: item.id,
        affectedCharacterIds: [command.characterId],
        before,
        after: null,
      })
    }

    const after = this.stamp({
      ...item,
      quantity: item.quantity - command.amount,
    })
    this.items.set(item.id, after)

    return this.finish(command, {
      kind: command.kind,
      itemId: item.id,
      affectedCharacterIds: [command.characterId],
      before,
      after: copy(after),
    })
  }
}