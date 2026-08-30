import {
  EMPTY_ENGINE_EFFECTS,
  EngineCommandError,
  mergeEngineEffects,
  type EngineCommandResult,
  type EngineEvent,
  type EngineEventPublisher,
} from "../engine-contracts/index.ts"
import type { ShapoklyakEngine } from "../entity-engine/index.ts"
import type { CheburashkaEngine } from "../inventory-engine/index.ts"
import type { LarisaEngine } from "../location-engine/index.ts"
import type { TobikPort } from "../roll-engine/index.ts"
import type { GenaCommand, GenaCommandResult, GenaDelegatedValue } from "./types.ts"

export type GenaDependencies = {
  cheburashka: Pick<CheburashkaEngine, "execute">
  shapoklyak: Pick<ShapoklyakEngine, "execute" | "getEntity">
  larisa: Pick<LarisaEngine, "execute">
  tobik: TobikPort
  eventPublisher?: EngineEventPublisher
}

function requireGm(command: GenaCommand): void {
  if (command.context.authority !== "gm" && command.context.authority !== "system") {
    throw new EngineCommandError("gena.gm_required", `${command.kind} requires GM authority`)
  }
}

function sessionEvent(command: GenaCommand, delegatedTo: GenaDelegatedValue["engine"]): EngineEvent {
  return {
    commandId: command.context.commandId,
    engine: "gena",
    kind: command.kind,
    campaignId: command.context.campaignId,
    aggregateType: "session",
    aggregateId: command.context.roomId || command.context.campaignId,
    occurredAt: command.context.occurredAt,
    visibility: command.context.authority === "gm" ? "gm" : "campaign",
    actorCharacterId: command.context.actorCharacterId,
    payload: { commandKind: command.kind, delegatedTo },
  }
}

export class GenaEngine {
  private readonly dependencies: GenaDependencies

  constructor(dependencies: GenaDependencies) { this.dependencies = dependencies }

  async execute(command: GenaCommand): Promise<GenaCommandResult> {
    let delegated: EngineCommandResult<GenaDelegatedValue>

    if (command.kind === "session.declare") {
      delegated = {
        value: { engine: "none", declaration: { label: command.label, payload: command.payload ?? {} } },
        events: [],
        effects: EMPTY_ENGINE_EFFECTS,
      }
    } else if (command.kind === "inventory.use") {
      const result = await this.dependencies.cheburashka.execute({
        kind: "inventory.consume",
        context: command.context,
        characterId: command.characterId,
        itemId: command.itemId,
        amount: command.amount ?? 1,
      })
      delegated = { value: { engine: "cheburashka", mutation: result.value }, events: result.events, effects: result.effects }
    } else if (command.kind === "inventory.transfer") {
      const result = await this.dependencies.cheburashka.execute({
        kind: "inventory.transfer",
        context: command.context,
        fromCharacterId: command.fromCharacterId,
        toCharacterId: command.toCharacterId,
        itemId: command.itemId,
        amount: command.amount,
      })
      delegated = { value: { engine: "cheburashka", mutation: result.value }, events: result.events, effects: result.effects }
    } else if (command.kind === "entity.reveal_npc") {
      requireGm(command)
      const result = await this.dependencies.shapoklyak.execute({
        kind: "entity.reveal_npc",
        context: command.context,
        viewerCharacterId: command.viewerCharacterId,
        npcCharacterId: command.npcCharacterId,
        discovered: command.discovered ?? true,
      })
      delegated = { value: { engine: "shapoklyak", mutation: result.value }, events: result.events, effects: result.effects }
    } else if (command.kind === "world.discover_location") {
      requireGm(command)
      const result = await this.dependencies.larisa.execute({
        kind: "world.discover_location",
        context: command.context,
        characterId: command.characterId,
        locationId: command.locationId,
        discovered: command.discovered ?? true,
      })
      delegated = { value: { engine: "larisa", mutation: result.value }, events: result.events, effects: result.effects }
    } else if (command.kind === "world.move_character") {
      requireGm(command)
      const entity = await this.dependencies.shapoklyak.getEntity(command.characterId)
      if (!entity || entity.campaign_id !== command.context.campaignId) {
        throw new EngineCommandError("gena.character_unavailable", "Character is unavailable in this campaign")
      }
      const result = await this.dependencies.larisa.execute({
        kind: "world.set_character_position",
        context: command.context,
        characterId: command.characterId,
        locationId: command.locationId,
        campaignDay: command.campaignDay,
        dayPeriod: command.dayPeriod,
      })
      delegated = { value: { engine: "larisa", mutation: result.value }, events: result.events, effects: result.effects }
    } else if (command.kind === "world.set_scene_position") {
      requireGm(command)
      const result = await this.dependencies.larisa.execute(command)
      delegated = { value: { engine: "larisa", mutation: result.value }, events: result.events, effects: result.effects }
    } else if (command.kind === "world.set_scene_participants") {
      requireGm(command)
      for (const characterId of command.characterIds) {
        const entity = await this.dependencies.shapoklyak.getEntity(characterId)
        if (!entity || entity.campaign_id !== command.context.campaignId) throw new EngineCommandError("gena.character_unavailable", "Scene participant is unavailable in this campaign")
      }
      const result = await this.dependencies.larisa.execute(command)
      delegated = { value: { engine: "larisa", mutation: result.value }, events: result.events, effects: result.effects }
    } else if (command.kind === "world.sync_scene_participants") {
      requireGm(command)
      const result = await this.dependencies.larisa.execute(command)
      delegated = { value: { engine: "larisa", mutation: result.value }, events: result.events, effects: result.effects }
    } else if (command.kind === "character.set_hp") {
      requireGm(command)
      const result = await this.dependencies.shapoklyak.execute({
        kind: "entity.set_hp",
        context: command.context,
        characterId: command.characterId,
        currentHp: command.currentHp,
        ...(command.maxHp !== undefined ? { maxHp: command.maxHp } : {}),
        ...(command.tempHp !== undefined ? { tempHp: command.tempHp } : {}),
      })
      delegated = { value: { engine: "shapoklyak", mutation: result.value }, events: result.events, effects: result.effects }
    } else {
      const roll = this.dependencies.tobik.execute(command.request)
      const tobikEvent: EngineEvent = {
        commandId: command.context.commandId,
        engine: "tobik",
        kind: "roll.resolved",
        campaignId: command.context.campaignId,
        aggregateType: "roll",
        aggregateId: command.context.commandId,
        occurredAt: command.context.occurredAt,
        visibility: "campaign",
        actorCharacterId: command.context.actorCharacterId,
        payload: { label: command.label, result: roll },
      }
      delegated = { value: { engine: "tobik", result: roll }, events: [tobikEvent], effects: EMPTY_ENGINE_EFFECTS }
    }

    const genaEvent = sessionEvent(command, delegated.value.engine)
    const events = [...delegated.events, genaEvent]
    // The owning domain engine already published its own event. Gena publishes
    // only the session-level orchestration event and returns both for correlation.
    await this.dependencies.eventPublisher?.publishEngineEvents([genaEvent])
    return {
      value: delegated.value,
      events,
      effects: mergeEngineEffects(delegated.effects),
    }
  }
}
