import {
  EngineCommandError,
  type CharacterResolutionRequester,
  type EngineCommandResult,
  type EngineEffects,
  type EngineEvent,
  type EngineEventPublisher,
} from "../engine-contracts/index.ts"
import { createInventoryMechanicalProjection } from "./projection.ts"
import { inventoryHolderProblem } from "./holders.ts"
import { inventoryStackMode } from "./stacking.ts"
import { inventoryPlacementProblem } from "./spatial.ts"
import type {
  CheburashkaCommand,
  CheburashkaStorage,
  InventoryMechanicalProjection,
  InventoryMutation,
} from "./types.ts"

export type CheburashkaDependencies = {
  eventPublisher?: EngineEventPublisher
  resolutionRequester?: CharacterResolutionRequester
}

function eventFor(command: CheburashkaCommand, mutation: InventoryMutation): EngineEvent {
  const characterId = mutation.affectedCharacterIds[0] || command.context.actorCharacterId || "unknown"
  return {
    commandId: command.context.commandId,
    engine: "cheburashka",
    kind: mutation.kind,
    campaignId: command.context.campaignId,
    aggregateType: "item",
    aggregateId: mutation.itemId,
    occurredAt: command.context.occurredAt,
    visibility: command.context.authority === "gm" ? "gm" : "actor",
    actorCharacterId: command.context.actorCharacterId,
    payload: {
      characterId,
      affectedCharacterIds: mutation.affectedCharacterIds,
      affectedWorldStorageIds: mutation.affectedWorldStorageIds ?? [],
      affectedSurfaceIds: mutation.affectedSurfaceIds ?? [],
      affectedSceneIds: mutation.affectedSceneIds ?? [],
      affectedLocationIds: mutation.affectedLocationIds ?? [],
      before: mutation.before,
      after: mutation.after,
      destinationItem: mutation.destinationItem ?? null,
      relatedChanges: mutation.relatedChanges ?? [],
    },
  }
}

function changed(mutation: InventoryMutation): boolean {
  if (mutation.destinationItem) return true
  if (mutation.relatedChanges?.length) return true
  if (mutation.before === null || mutation.after === null) return mutation.before !== mutation.after
  return (mutation.before.version ?? 0) !== (mutation.after.version ?? 0)
    || mutation.before.character_id !== mutation.after.character_id
    || (mutation.before.world_storage_id ?? null) !== (mutation.after.world_storage_id ?? null)
    || (mutation.before.surface_id ?? null) !== (mutation.after.surface_id ?? null)
    || mutation.before.quantity !== mutation.after.quantity
    || mutation.before.charges_current !== mutation.after.charges_current
    || mutation.before.equipped !== mutation.after.equipped
    || JSON.stringify(mutation.before.mechanics ?? []) !== JSON.stringify(mutation.after.mechanics ?? [])
}

function effectsFor(mutation: InventoryMutation, requiresResolution: boolean): EngineEffects {
  return {
    characterIds: mutation.affectedCharacterIds,
    itemIds: [...new Set([
      mutation.itemId,
      mutation.destinationItem?.id || "",
      ...(mutation.relatedChanges || []).flatMap((change) => [change.before.id, change.after.id]),
    ].filter(Boolean))],
    locationIds: mutation.affectedLocationIds ?? [],
    sceneIds: mutation.affectedSceneIds ?? [],
    resolveCharacterIds: requiresResolution ? mutation.affectedCharacterIds : [],
  }
}

function isGm(command: CheburashkaCommand) {
  return command.context.authority === "gm" || command.context.authority === "system"
}

function playerSourceCharacterId(command: CheburashkaCommand): string | null {
  if (command.kind === "inventory.transfer") return command.fromCharacterId
  if ("characterId" in command) return command.characterId
  return null
}

export class CheburashkaEngine {
  private readonly storage: CheburashkaStorage
  private readonly dependencies: CheburashkaDependencies

  constructor(
    storage: CheburashkaStorage,
    dependencies: CheburashkaDependencies = {},
  ) {
    this.storage = storage
    this.dependencies = dependencies
  }

  listCharacterItems(characterId: string) {
    if (!characterId) throw new EngineCommandError("inventory.character_required", "Character id is required")
    return this.storage.listCharacterItems(characterId)
  }

  listWorldStorageItems(worldStorageId: string) {
    if (!worldStorageId) throw new EngineCommandError("inventory.world_storage_required", "World storage id is required")
    return this.storage.listWorldStorageItems(worldStorageId)
  }

  listSurfaceItems(surfaceId: string) {
    if (!surfaceId) throw new EngineCommandError("inventory.surface_required", "Surface id is required")
    return this.storage.listSurfaceItems(surfaceId)
  }

  getItem(itemId: string) {
    if (!itemId) throw new EngineCommandError("inventory.item_required", "Item id is required")
    return this.storage.getItem(itemId)
  }

  async mechanicalProjection(characterId: string): Promise<InventoryMechanicalProjection> {
    return createInventoryMechanicalProjection(characterId, await this.listCharacterItems(characterId))
  }

  private async assertPlayerItemAccess(command: CheburashkaCommand): Promise<void> {
    if (command.context.authority !== "player") return

    const sourceCharacterId = playerSourceCharacterId(command)
    if (!sourceCharacterId || command.context.actorCharacterId !== sourceCharacterId) {
      throw new EngineCommandError(
        "inventory.player_forbidden",
        "Player inventory commands are limited to the active actor character",
      )
    }

    if (command.kind === "inventory.take_surface") {
      // Surface access and first-take ownership are authoritative in the storage
      // transaction. Do not turn a legitimate race loser into player_forbidden
      // by inspecting a row that may already have moved to the winner.
      return
    }

    if (!("itemId" in command) || typeof command.itemId !== "string") return
    const item = await this.storage.getItem(command.itemId)
    const permitted = command.kind === "inventory.take_world"
      ? Boolean(item && item.world_storage_id === command.worldStorageId)
      : Boolean(
          item
          && item.character_id === sourceCharacterId
          && !item.world_storage_id
          && !item.surface_id
        )
    if (!permitted) {
      throw new EngineCommandError(
        "inventory.player_forbidden",
        command.kind === "inventory.take_world"
          ? "Player can only take an item from the requested accessible world storage"
          : "Player can only mutate an inventory item held by the active actor character",
      )
    }
  }

  async execute(command: CheburashkaCommand): Promise<EngineCommandResult<InventoryMutation>> {
    if (["inventory.create", "inventory.create_surface", "inventory.update", "inventory.remove"].includes(command.kind) && !isGm(command)) {
      throw new EngineCommandError("inventory.gm_required", "Only GM authority can establish inventory contents")
    }

    if (command.kind === "inventory.create" || command.kind === "inventory.create_surface" || command.kind === "inventory.update") {
      if (!command.input.name.trim()) {
        throw new EngineCommandError("inventory.name_required", "Item name is required")
      }
      if (!Number.isInteger(command.input.quantity) || command.input.quantity < 1) {
        throw new EngineCommandError("inventory.invalid_quantity", "Inventory quantity must be an integer >= 1")
      }
      if (command.input.weight !== null && (!Number.isFinite(command.input.weight) || command.input.weight < 0)) {
        throw new EngineCommandError("inventory.invalid_weight", "Inventory weight cannot be negative")
      }
      if (inventoryStackMode(command.input) === "instance" && command.input.quantity !== 1) {
        throw new EngineCommandError(
          "inventory.instance_quantity",
          "Inventory instance quantity must be 1",
        )
      }
    }

    if ((command.kind === "inventory.create" || command.kind === "inventory.create_surface") && command.input.equipped) {
      throw new EngineCommandError(
        "inventory.create_equipped_forbidden",
        "Create the inventory item first, then equip it through the equipment command",
      )
    }

    if (command.kind === "inventory.update") {
      const current = await this.storage.getItem(command.itemId)
      if (current && current.character_id === command.characterId) {
        if (command.input.equipped !== current.equipped) {
          throw new EngineCommandError(
            "inventory.equipment_transition_forbidden",
            "Equipment state must change through the equipment or spatial move command",
          )
        }
        if (
          current.equipped
          && (
            command.input.category !== "equipment"
            || command.input.equipment_slot !== current.equipment_slot
          )
        ) {
          throw new EngineCommandError(
            "inventory.equipped_identity_locked",
            "Move the equipped item before changing its category or equipment slot",
          )
        }
      }
    }

    if (command.kind === "inventory.set_equipped" && !command.equipped) {
      throw new EngineCommandError(
        "inventory.unequip_destination_required",
        "Unequip requires a real hand, bag or external carry destination",
      )
    }

    if (
      (command.kind === "inventory.update"
        || command.kind === "inventory.remove"
        || command.kind === "inventory.set_equipped"
        || command.kind === "inventory.consume"
        || command.kind === "inventory.move"
        || command.kind === "inventory.transfer"
        || command.kind === "inventory.store_world"
        || command.kind === "inventory.take_world"
        || command.kind === "inventory.place_surface"
        || command.kind === "inventory.take_surface")
      && command.expectedVersion !== undefined
      && (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 1)
    ) {
      throw new EngineCommandError("inventory.invalid_version", "Expected inventory version must be an integer >= 1")
    }

    if (
      command.kind === "inventory.consume"
      || command.kind === "inventory.transfer"
      || command.kind === "inventory.store_world"
      || command.kind === "inventory.take_world"
      || command.kind === "inventory.place_surface"
      || command.kind === "inventory.take_surface"
    ) {
      if (!Number.isInteger(command.amount) || command.amount < 1) {
        throw new EngineCommandError("inventory.invalid_amount", "Inventory amount must be an integer >= 1")
      }
    }

    await this.assertPlayerItemAccess(command)

    if (command.kind === "inventory.remove") {
      const items = await this.storage.listCharacterItems(command.characterId)
      if (items.some((item) => (item.holder_item_id ?? null) === command.itemId)) {
        throw new EngineCommandError(
          "inventory.container_not_empty",
          "Inventory container is not empty",
        )
      }
    }

    if (command.kind === "inventory.move") {
      const source = await this.storage.getItem(command.itemId)
      if (source && source.character_id === command.characterId) {
        const items = await this.storage.listCharacterItems(command.characterId)
        const holderItemId = command.placement?.kind === "grid"
          ? command.placement.holderItemId
          : command.holderItemId
        const problem = inventoryHolderProblem(items, source, holderItemId)
        if (problem) {
          const messages = {
            self: "Inventory item cannot contain itself",
            missing: "Inventory holder not found",
            different_character: "Inventory holder must belong to the same character",
            not_container: "Inventory holder must be a container",
            cycle: "Inventory container cycle is not allowed",
            depth: "Inventory container nesting depth exceeds 16",
          } as const
          throw new EngineCommandError(`inventory.holder_${problem}`, messages[problem])
        }

        if (command.placement) {
          const placementProblem = inventoryPlacementProblem(items, source, command.placement)
          if (placementProblem) {
            throw new EngineCommandError("inventory.placement_invalid", placementProblem)
          }
        }
      }
    }

    if (
      command.kind === "inventory.transfer"
      || command.kind === "inventory.store_world"
      || command.kind === "inventory.take_world"
      || command.kind === "inventory.place_surface"
      || command.kind === "inventory.take_surface"
    ) {
      const source = await this.storage.getItem(command.itemId)
      const sourceMatches = command.kind === "inventory.transfer"
        ? source?.character_id === command.fromCharacterId
        : command.kind === "inventory.store_world" || command.kind === "inventory.place_surface"
          ? source?.character_id === command.characterId
          : command.kind === "inventory.take_world"
            ? source?.world_storage_id === command.worldStorageId
            : source?.surface_id === command.surfaceId
      if (
        source &&
        sourceMatches &&
        inventoryStackMode(source) === "instance" &&
        command.amount !== source.quantity
      ) {
        throw new EngineCommandError(
          "inventory.instance_split_forbidden",
          "Inventory instance cannot be split",
        )
      }
    }

    const mutation = await this.storage.execute(command)
    const requiresResolution = changed(mutation)
    const event = eventFor(command, mutation)
    await this.dependencies.eventPublisher?.publishEngineEvents([event])

    // Direct engine-to-engine signal. CE stores nothing: the receiver assembles
    // fresh Shapoklyak/Cheburashka/etc. projections and invokes CE once.
    if (requiresResolution) {
      for (const characterId of mutation.affectedCharacterIds) {
        await this.dependencies.resolutionRequester?.requestCharacterResolution({
          characterId,
          source: "cheburashka",
          reason: mutation.kind,
          commandId: command.context.commandId,
        })
      }
    }

    return { value: mutation, events: [event], effects: effectsFor(mutation, requiresResolution) }
  }
}