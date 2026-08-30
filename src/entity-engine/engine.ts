import {
  EngineCommandError,
  type CharacterResolutionRequester,
  type EngineCommandResult,
  type EngineEvent,
  type EngineEventPublisher,
} from "../engine-contracts/index.ts"
import type { CharacterEntity, EntityMutation, ShapoklyakCommand, ShapoklyakStorage } from "./types.ts"

export type ShapoklyakDependencies = {
  eventPublisher?: EngineEventPublisher
  resolutionRequester?: CharacterResolutionRequester
}

export class ShapoklyakEngine {
  private readonly storage: ShapoklyakStorage
  private readonly dependencies: ShapoklyakDependencies

  constructor(
    storage: ShapoklyakStorage,
    dependencies: ShapoklyakDependencies = {},
  ) {
    this.storage = storage
    this.dependencies = dependencies
  }

  listCampaignEntities(campaignId: string): Promise<CharacterEntity[]> {
    if (!campaignId) throw new EngineCommandError("entity.campaign_required", "Campaign id is required")
    return this.storage.listCampaignEntities(campaignId)
  }

  getEntity(characterId: string): Promise<CharacterEntity | null> {
    if (!characterId) throw new EngineCommandError("entity.character_required", "Character id is required")
    return this.storage.getEntity(characterId)
  }

  async execute(command: ShapoklyakCommand): Promise<EngineCommandResult<EntityMutation>> {
    if (command.kind === "entity.set_hp") {
      if (command.context.authority !== "gm" && command.context.authority !== "system") {
        throw new EngineCommandError("entity.gm_required", "Only GM authority can establish HP")
      }
      for (const [label, value] of Object.entries({ currentHp: command.currentHp, maxHp: command.maxHp, tempHp: command.tempHp })) {
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
          throw new EngineCommandError("entity.invalid_hp", `${label} must be an integer >= 0`)
        }
      }
    }

    if (command.kind === "entity.assign_template" || command.kind === "entity.remove_template_assignment") {
      if (command.context.authority !== "gm" && command.context.authority !== "system") {
        throw new EngineCommandError("entity.gm_required", "Only GM authority can change character template assignments")
      }
      if (command.kind === "entity.assign_template") {
        if (!command.input.templateId) throw new EngineCommandError("entity.template_required", "Template id is required")
        if (command.input.templateLevel !== null && (!Number.isInteger(command.input.templateLevel) || command.input.templateLevel < 1 || command.input.templateLevel > 30)) {
          throw new EngineCommandError("entity.invalid_template_level", "Template level must be null or an integer from 1 to 30")
        }
      } else if (!command.assignmentId) {
        throw new EngineCommandError("entity.assignment_required", "Template assignment id is required")
      }
    }

    const mutation = await this.storage.execute(command)
    const aggregateId = mutation.characterIds[0] || command.context.campaignId
    const event: EngineEvent = {
      commandId: command.context.commandId,
      engine: "shapoklyak",
      kind: mutation.kind,
      campaignId: command.context.campaignId,
      aggregateType: "character",
      aggregateId,
      occurredAt: command.context.occurredAt,
      visibility: command.context.authority === "gm" ? "gm" : "actor",
      actorCharacterId: command.context.actorCharacterId,
      payload: {
        characterIds: mutation.characterIds,
        before: mutation.before ?? null,
        after: mutation.after ?? null,
        ...mutation.details,
      },
    }
    await this.dependencies.eventPublisher?.publishEngineEvents([event])

    if (mutation.requiresResolution) {
      for (const characterId of mutation.characterIds) {
        await this.dependencies.resolutionRequester?.requestCharacterResolution({
          characterId,
          source: "shapoklyak",
          reason: mutation.kind,
          commandId: command.context.commandId,
        })
      }
    }

    return {
      value: mutation,
      events: [event],
      effects: {
        characterIds: mutation.characterIds,
        itemIds: [],
        locationIds: [],
        sceneIds: [],
        resolveCharacterIds: mutation.requiresResolution ? mutation.characterIds : [],
      },
    }
  }
}
