import {
  EngineCommandError,
  type CharacterResolutionRequester,
  type EngineCommandResult,
  type EngineEffects,
  type EngineEvent,
  type EngineEventPublisher,
} from "../engine-contracts/index.ts"
import { createInventoryMechanicalProjection } from "./projection.ts"
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
      before: mutation.before,
      after: mutation.after,
      destinationItem: mutation.destinationItem ?? null,
    },
  }
}

function changed(mutation: InventoryMutation): boolean {
  if (mutation.destinationItem) return true
  if (mutation.before === null || mutation.after === null) return mutation.before !== mutation.after
  return (mutation.before.version ?? 0) !== (mutation.after.version ?? 0)
    || mutation.before.character_id !== mutation.after.character_id
    || mutation.before.quantity !== mutation.after.quantity
    || mutation.before.charges_current !== mutation.after.charges_current
    || mutation.before.equipped !== mutation.after.equipped
    || JSON.stringify(mutation.before.mechanics ?? []) !== JSON.stringify(mutation.after.mechanics ?? [])
}

function effectsFor(mutation: InventoryMutation, requiresResolution: boolean): EngineEffects {
  return {
    characterIds: mutation.affectedCharacterIds,
    itemIds: [mutation.itemId, mutation.destinationItem?.id || ""].filter(Boolean),
    locationIds: [],
    sceneIds: [],
    resolveCharacterIds: requiresResolution ? mutation.affectedCharacterIds : [],
  }
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

  getItem(itemId: string) {
    if (!itemId) throw new EngineCommandError("inventory.item_required", "Item id is required")
    return this.storage.getItem(itemId)
  }

  async mechanicalProjection(characterId: string): Promise<InventoryMechanicalProjection> {
    return createInventoryMechanicalProjection(characterId, await this.listCharacterItems(characterId))
  }

  async execute(command: CheburashkaCommand): Promise<EngineCommandResult<InventoryMutation>> {
    if (command.kind === "inventory.consume" || command.kind === "inventory.transfer") {
      if (!Number.isInteger(command.amount) || command.amount < 1) {
        throw new EngineCommandError("inventory.invalid_amount", "Inventory amount must be an integer >= 1")
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
