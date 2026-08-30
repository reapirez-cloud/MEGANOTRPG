import { EngineCommandError, type EngineCommandContext } from "../engine-contracts/index.ts"
import type { ShapoklyakEngine } from "../entity-engine/index.ts"
import type { CheburashkaEngine } from "../inventory-engine/index.ts"
import type { LarisaEngine } from "../location-engine/index.ts"
import type { ChasovoyEngine } from "../reference-engine/index.ts"
import type {
  OracleCharacterCommands,
  OracleDefinitionCommands,
  OracleInventoryCommands,
  OracleWorldCommands,
} from "./types.ts"

export type OracleDependencies = {
  shapoklyak: Pick<ShapoklyakEngine, "execute">
  cheburashka: Pick<CheburashkaEngine, "execute">
  larisa: Pick<LarisaEngine, "execute">
  chasovoy: Pick<ChasovoyEngine, "execute">
}

function assertOracleAuthority(context: EngineCommandContext): void {
  if (context.authority !== "gm" && context.authority !== "system") {
    throw new EngineCommandError("oracle.gm_required", "Oracle only accepts GM or system authority")
  }
}

/**
 * Oracle is the GM's hands.
 *
 * It is intentionally NOT a gameplay orchestrator:
 * - it does not call Gena;
 * - it does not infer which engine owns an action;
 * - it does not apply gameplay permission/rule checks;
 * - it does not own canonical state;
 * - it does not emit a second orchestration event.
 *
 * Every public method is already wired to one explicit domain owner. The owner
 * still enforces technical/domain invariants and publishes the canonical event.
 */
export class OracleEngine {
  readonly characters: OracleCharacterCommands
  readonly inventory: OracleInventoryCommands
  readonly world: OracleWorldCommands
  readonly definitions: OracleDefinitionCommands

  constructor(dependencies: OracleDependencies) {
    const direct = <T>(context: EngineCommandContext, action: () => T): T => {
      assertOracleAuthority(context)
      return action()
    }

    this.characters = {
      create: (context, input) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.create",
        context,
        input,
      })),
      update: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.update",
        context,
        characterId,
        input,
      })),
      delete: (context, characterId) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.delete",
        context,
        characterId,
      })),
      setActive: (context, userId, characterId) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.set_active",
        context,
        userId,
        characterId,
      })),
      setLifeState: (context, characterId, lifeState) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.set_life_state",
        context,
        characterId,
        lifeState,
      })),
      setVisibility: (context, characterId, visibilityMode) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.set_visibility",
        context,
        characterId,
        visibilityMode,
      })),
      revealNpc: (context, viewerCharacterId, npcCharacterId, discovered = true) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.reveal_npc",
        context,
        viewerCharacterId,
        npcCharacterId,
        discovered,
      })),
      setHp: (context, characterId, currentHp, options = {}) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.set_hp",
        context,
        characterId,
        currentHp,
        ...(options.maxHp !== undefined ? { maxHp: options.maxHp } : {}),
        ...(options.tempHp !== undefined ? { tempHp: options.tempHp } : {}),
      })),
      assignTemplate: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.assign_template",
        context,
        characterId,
        input,
      })),
      removeTemplateAssignment: (context, characterId, assignmentId) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.remove_template_assignment",
        context,
        characterId,
        assignmentId,
      })),
    }

    this.inventory = {
      create: (context, characterId, input) => direct(context, () => dependencies.cheburashka.execute({
        kind: "inventory.create",
        context,
        characterId,
        input,
      })),
      update: (context, characterId, itemId, input) => direct(context, () => dependencies.cheburashka.execute({
        kind: "inventory.update",
        context,
        characterId,
        itemId,
        input,
      })),
      remove: (context, characterId, itemId) => direct(context, () => dependencies.cheburashka.execute({
        kind: "inventory.remove",
        context,
        characterId,
        itemId,
      })),
      setEquipped: (context, characterId, itemId, equipped, equipmentSlot = null) => direct(context, () => dependencies.cheburashka.execute({
        kind: "inventory.set_equipped",
        context,
        characterId,
        itemId,
        equipped,
        equipmentSlot,
      })),
      consume: (context, characterId, itemId, amount = 1) => direct(context, () => dependencies.cheburashka.execute({
        kind: "inventory.consume",
        context,
        characterId,
        itemId,
        amount,
      })),
      transfer: (context, fromCharacterId, toCharacterId, itemId, amount) => direct(context, () => dependencies.cheburashka.execute({
        kind: "inventory.transfer",
        context,
        fromCharacterId,
        toCharacterId,
        itemId,
        amount,
      })),
    }

    this.world = {
      discoverLocation: (context, characterId, locationId, discovered = true) => direct(context, () => dependencies.larisa.execute({
        kind: "world.discover_location",
        context,
        characterId,
        locationId,
        discovered,
      })),
      moveCharacter: (context, characterId, locationId, campaignDay, dayPeriod) => direct(context, () => dependencies.larisa.execute({
        kind: "world.set_character_position",
        context,
        characterId,
        locationId,
        campaignDay,
        dayPeriod,
      })),
      setScenePosition: (context, roomId, locationId, campaignDay, dayPeriod) => direct(context, () => dependencies.larisa.execute({
        kind: "world.set_scene_position",
        context,
        roomId,
        locationId,
        campaignDay,
        dayPeriod,
      })),
      setSceneParticipants: (context, roomId, characterIds) => direct(context, () => dependencies.larisa.execute({
        kind: "world.set_scene_participants",
        context,
        roomId,
        characterIds,
      })),
      syncSceneParticipants: (context, roomId, options) => direct(context, () => dependencies.larisa.execute({
        kind: "world.sync_scene_participants",
        context,
        roomId,
        syncLocation: options.syncLocation,
        syncTime: options.syncTime,
      })),
    }

    this.definitions = {
      create: (context, input) => direct(context, () => dependencies.chasovoy.execute({
        kind: "definition.create",
        context,
        input,
      })),
      revise: (context, definitionId, input) => direct(context, () => dependencies.chasovoy.execute({
        kind: "definition.revise",
        context,
        definitionId,
        input,
      })),
      archive: (context, definitionId) => direct(context, () => dependencies.chasovoy.execute({
        kind: "definition.archive",
        context,
        definitionId,
      })),
    }
  }
}
