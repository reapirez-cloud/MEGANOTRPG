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
      .filter((item) => item.character_id === characterId && !item.world_storage_id)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at),
      )
      .map(copy)
  }

  async listWorldStorageItems(worldStorageId: string): Promise<InventoryItem[]> {
    return [...this.items.values()]
      .filter((item) => item.world_storage_id === worldStorageId && !item.character_id)
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
      if (command.input.equipped) {
        throw new EngineCommandError(
          "inventory.create_equipped_forbidden",
          "Create the inventory item first, then equip it through the equipment command",
        )
      }
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
        world_storage_id: null,
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
          world_storage_id: null,
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
            world_storage_id: null,
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
          world_storage_id: null,
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

    if (command.kind === "inventory.store_world") {
      const source = this.owned(command.itemId, command.characterId)
      this.assertVersion(source, command.expectedVersion)
      if (source.equipped) {
        throw new EngineCommandError("inventory.unequip_destination_required", "Equipped item needs a real carried destination first")
      }
      if (command.amount > source.quantity) {
        throw new EngineCommandError("inventory.insufficient_quantity", "Not enough items to store")
      }
      if (inventoryStackMode(source) === "instance" && command.amount !== source.quantity) {
        throw new EngineCommandError("inventory.instance_split_forbidden", "Inventory instance cannot be split")
      }

      const before = copy(source)
      const storageItems = [...this.items.values()].filter((item) => item.world_storage_id === command.worldStorageId)
      const holder = storageItems.find((item) => item.id === command.placement.holderItemId)
      if (!holder || holder.category !== "container") {
        throw new EngineCommandError("inventory.holder_missing", "World storage root container was not found")
      }

      let sourceAfter: InventoryItem | null = null
      let destination: InventoryItem
      const relatedChanges = []

      if (command.amount === source.quantity) {
        const descendantIds = source.category === "container"
          ? inventorySubtreeIds([...this.items.values()], source.id)
          : []
        destination = this.stamp({
          ...source,
          character_id: null,
          world_storage_id: command.worldStorageId,
          holder_item_id: command.placement.holderItemId,
          placement_kind: "grid",
          placement_index: null,
          grid_x: command.placement.gridX,
          grid_y: command.placement.gridY,
          grid_rotation: command.placement.rotation,
          equipped: false,
        })
        const placementProblem = inventoryPlacementProblem(
          [...storageItems, destination],
          destination,
          command.placement,
        )
        if (placementProblem) {
          throw new EngineCommandError("inventory.placement_invalid", placementProblem)
        }
        this.items.set(source.id, destination)

        for (const descendantId of descendantIds) {
          const descendant = this.items.get(descendantId)
          if (!descendant) continue
          const descendantBefore = copy(descendant)
          const descendantAfter = this.stamp({
            ...descendant,
            character_id: null,
            world_storage_id: command.worldStorageId,
            equipped: false,
          })
          this.items.set(descendantId, descendantAfter)
          relatedChanges.push({ before: descendantBefore, after: copy(descendantAfter) })
        }
      } else {
        sourceAfter = this.stamp({ ...source, quantity: source.quantity - command.amount })
        destination = {
          ...copy(source),
          id: `${source.id}-world-${command.context.commandId}`,
          character_id: null,
          world_storage_id: command.worldStorageId,
          quantity: command.amount,
          holder_item_id: command.placement.holderItemId,
          placement_kind: "grid",
          placement_index: null,
          grid_x: command.placement.gridX,
          grid_y: command.placement.gridY,
          grid_rotation: command.placement.rotation,
          equipped: false,
          version: 1,
          created_at: command.context.occurredAt,
          updated_at: command.context.occurredAt,
        }
        const placementProblem = inventoryPlacementProblem(
          [...storageItems, destination],
          destination,
          command.placement,
        )
        if (placementProblem) {
          throw new EngineCommandError("inventory.placement_invalid", placementProblem)
        }
        this.items.set(source.id, sourceAfter)
        this.items.set(destination.id, destination)
      }

      return this.finish(command, {
        kind: command.kind,
        itemId: source.id,
        affectedCharacterIds: [command.characterId],
        affectedWorldStorageIds: [command.worldStorageId],
        before,
        after: sourceAfter ? copy(sourceAfter) : null,
        destinationItem: copy(destination),
        ...(relatedChanges.length ? { relatedChanges } : {}),
      })
    }

    if (command.kind === "inventory.take_world") {
      const source = this.items.get(command.itemId)
      if (!source || source.world_storage_id !== command.worldStorageId || source.character_id) {
        throw new EngineCommandError("inventory.not_found", "Inventory item was not found in world storage")
      }
      if (!source.holder_item_id) {
        throw new EngineCommandError("inventory.world_storage_root", "World storage root cannot be taken as contents")
      }
      this.assertVersion(source, command.expectedVersion)
      if (command.amount > source.quantity) {
        throw new EngineCommandError("inventory.insufficient_quantity", "Not enough items to take")
      }
      if (inventoryStackMode(source) === "instance" && command.amount !== source.quantity) {
        throw new EngineCommandError("inventory.instance_split_forbidden", "Inventory instance cannot be split")
      }

      const before = copy(source)
      const characterItems = [...this.items.values()].filter((item) => item.character_id === command.characterId)
      let sourceAfter: InventoryItem | null = null
      let destination: InventoryItem
      const relatedChanges = []
      const placement = command.placement

      const destinationState = {
        character_id: command.characterId,
        world_storage_id: null,
        holder_item_id: placement.kind === "grid" ? placement.holderItemId : null,
        placement_kind: placement.kind,
        placement_index: placement.kind === "hand" || placement.kind === "external" ? placement.index : null,
        grid_x: placement.kind === "grid" ? placement.gridX : null,
        grid_y: placement.kind === "grid" ? placement.gridY : null,
        grid_rotation: placement.kind === "grid" ? placement.rotation : 0,
        equipped: false,
      } as const

      if (command.amount === source.quantity) {
        const descendantIds = source.category === "container"
          ? inventorySubtreeIds([...this.items.values()], source.id)
          : []
        destination = this.stamp({ ...source, ...destinationState })
        const placementProblem = inventoryPlacementProblem(
          [...characterItems, destination],
          destination,
          placement,
        )
        if (placementProblem) {
          throw new EngineCommandError("inventory.placement_invalid", placementProblem)
        }
        this.items.set(source.id, destination)

        for (const descendantId of descendantIds) {
          const descendant = this.items.get(descendantId)
          if (!descendant) continue
          const descendantBefore = copy(descendant)
          const descendantAfter = this.stamp({
            ...descendant,
            character_id: command.characterId,
            world_storage_id: null,
            equipped: false,
          })
          this.items.set(descendantId, descendantAfter)
          relatedChanges.push({ before: descendantBefore, after: copy(descendantAfter) })
        }
      } else {
        sourceAfter = this.stamp({ ...source, quantity: source.quantity - command.amount })
        destination = {
          ...copy(source),
          ...destinationState,
          id: `${source.id}-char-${command.context.commandId}`,
          quantity: command.amount,
          version: 1,
          created_at: command.context.occurredAt,
          updated_at: command.context.occurredAt,
        }
        const placementProblem = inventoryPlacementProblem(
          [...characterItems, destination],
          destination,
          placement,
        )
        if (placementProblem) {
          throw new EngineCommandError("inventory.placement_invalid", placementProblem)
        }
        this.items.set(source.id, sourceAfter)
        this.items.set(destination.id, destination)
      }

      return this.finish(command, {
        kind: command.kind,
        itemId: source.id,
        affectedCharacterIds: [command.characterId],
        affectedWorldStorageIds: [command.worldStorageId],
        before,
        after: sourceAfter ? copy(sourceAfter) : null,
        destinationItem: copy(destination),
        ...(relatedChanges.length ? { relatedChanges } : {}),
      })
    }

    if (command.kind === "inventory.move") {
      const item = this.owned(command.itemId, command.characterId)
      this.assertVersion(item, command.expectedVersion)
      if (command.placement?.kind === "root" && item.equipped) {
        throw new EngineCommandError(
          "inventory.unequip_destination_required",
          "Unequip requires a real hand, bag or external carry destination",
        )
      }
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
      if (command.input.equipped !== item.equipped) {
        throw new EngineCommandError(
          "inventory.equipment_transition_forbidden",
          "Equipment state must change through the equipment or spatial move command",
        )
      }
      if (
        item.equipped
        && (
          command.input.category !== "equipment"
          || command.input.equipment_slot !== item.equipment_slot
        )
      ) {
        throw new EngineCommandError(
          "inventory.equipped_identity_locked",
          "Move the equipped item before changing its category or equipment slot",
        )
      }
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
      if (!command.equipped) {
        throw new EngineCommandError(
          "inventory.unequip_destination_required",
          "Unequip requires a real hand, bag or external carry destination",
        )
      }
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

      if (command.equipped) {
        const conflict = [...this.items.values()].some((other) => {
          if (
            other.id === item.id
            || other.character_id !== item.character_id
            || !other.equipped
          ) return false

          const sameSlot = other.equipment_slot === command.equipmentSlot
          const handConflict =
            command.equipmentSlot === "two_hands"
              ? other.equipment_slot === "main_hand" || other.equipment_slot === "off_hand"
              : (command.equipmentSlot === "main_hand" || command.equipmentSlot === "off_hand")
                && other.equipment_slot === "two_hands"
          return sameSlot || handConflict
        })
        if (conflict) {
          throw new EngineCommandError(
            "inventory.equipment_slot_occupied",
            "Equipment slot is occupied; choose a destination for the equipped item first",
          )
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