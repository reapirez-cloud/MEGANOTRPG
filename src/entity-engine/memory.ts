import { EngineCommandError } from "../engine-contracts/index.ts"
import type { CharacterEntity, EntityMutation, ShapoklyakCommand, ShapoklyakStorage } from "./types.ts"

function copy<T>(value: T): T { return structuredClone(value) }

export class MemoryShapoklyakStorage implements ShapoklyakStorage {
  private readonly entities = new Map<string, CharacterEntity>()
  private readonly activeByUser = new Map<string, string | null>()
  private readonly discoveries = new Set<string>()
  private readonly hp = new Map<string, { currentHp: number; maxHp?: number; tempHp?: number }>()
  private readonly templateAssignments = new Map<string, { characterId: string; templateId: string; templateLevel: number | null; selectedChoices: Record<string, unknown> }>()

  constructor(initial: readonly CharacterEntity[] = []) {
    for (const entity of initial) this.entities.set(entity.id, copy(entity))
  }

  async listCampaignEntities(campaignId: string): Promise<CharacterEntity[]> {
    return [...this.entities.values()].filter((entity) => entity.campaign_id === campaignId).map(copy)
  }

  async getEntity(characterId: string): Promise<CharacterEntity | null> {
    const value = this.entities.get(characterId)
    return value ? copy(value) : null
  }

  private require(characterId: string): CharacterEntity {
    const entity = this.entities.get(characterId)
    if (!entity) throw new EngineCommandError("entity.not_found", "Character was not found")
    return entity
  }

  async execute(command: ShapoklyakCommand): Promise<EntityMutation> {
    if (command.kind === "entity.create") {
      const id = `character-${command.context.commandId}`
      const entity: CharacterEntity = {
        id,
        campaign_id: command.context.campaignId,
        ...command.input,
        assigned_user_id: command.input.character_type === "npc" ? null : command.input.assigned_user_id,
        visibility_mode: command.input.visibility === "private" ? "private" : command.input.character_type === "npc" ? "discover" : "always",
        life_state: "alive",
        died_at: null,
        created_by: command.context.requestedBy,
        created_at: command.context.occurredAt,
        updated_at: command.context.occurredAt,
      }
      this.entities.set(id, entity)
      return { kind: command.kind, characterIds: [id], before: null, after: copy(entity), requiresResolution: true }
    }

    if (command.kind === "entity.set_active") {
      if (command.characterId) this.require(command.characterId)
      this.activeByUser.set(command.userId, command.characterId)
      return { kind: command.kind, characterIds: command.characterId ? [command.characterId] : [], details: { userId: command.userId, activeCharacterId: command.characterId }, requiresResolution: false }
    }

    if (command.kind === "entity.reveal_npc") {
      const viewer = this.require(command.viewerCharacterId)
      const npc = this.require(command.npcCharacterId)
      if (viewer.campaign_id !== npc.campaign_id || npc.character_type !== "npc") throw new EngineCommandError("entity.invalid_discovery", "NPC discovery is invalid")
      const key = `${viewer.id}:${npc.id}`
      if (command.discovered) this.discoveries.add(key); else this.discoveries.delete(key)
      return { kind: command.kind, characterIds: [viewer.id, npc.id], details: { discovered: command.discovered }, requiresResolution: false }
    }

    const characterId = command.characterId
    const before = copy(this.require(characterId))

    if (command.kind === "entity.delete") {
      this.entities.delete(characterId)
      this.hp.delete(characterId)
      for (const [assignmentId, assignment] of this.templateAssignments) {
        if (assignment.characterId === characterId) this.templateAssignments.delete(assignmentId)
      }
      return { kind: command.kind, characterIds: [characterId], before, after: null, requiresResolution: true }
    }

    if (command.kind === "entity.set_hp") {
      this.hp.set(characterId, { currentHp: command.currentHp, ...(command.maxHp !== undefined ? { maxHp: command.maxHp } : {}), ...(command.tempHp !== undefined ? { tempHp: command.tempHp } : {}) })
      return { kind: command.kind, characterIds: [characterId], before, after: before, details: this.hp.get(characterId), requiresResolution: true }
    }

    if (command.kind === "entity.assign_template") {
      const existing = [...this.templateAssignments.entries()].find(([, assignment]) => assignment.characterId === characterId && assignment.templateId === command.input.templateId)
      const assignmentId = existing?.[0] || `assignment-${command.context.commandId}`
      this.templateAssignments.set(assignmentId, {
        characterId,
        templateId: command.input.templateId,
        templateLevel: command.input.templateLevel,
        selectedChoices: copy(command.input.selectedChoices),
      })
      return {
        kind: command.kind,
        characterIds: [characterId],
        before,
        after: before,
        details: { assignmentId, templateId: command.input.templateId, templateLevel: command.input.templateLevel },
        requiresResolution: true,
      }
    }

    if (command.kind === "entity.remove_template_assignment") {
      const assignment = this.templateAssignments.get(command.assignmentId)
      if (assignment && assignment.characterId !== characterId) throw new EngineCommandError("entity.assignment_mismatch", "Template assignment belongs to another character")
      this.templateAssignments.delete(command.assignmentId)
      return {
        kind: command.kind,
        characterIds: [characterId],
        before,
        after: before,
        details: { assignmentId: command.assignmentId },
        requiresResolution: true,
      }
    }

    let after: CharacterEntity
    if (command.kind === "entity.update") {
      after = { ...before, ...command.input, assigned_user_id: command.input.character_type === "npc" ? null : command.input.assigned_user_id, updated_at: command.context.occurredAt }
    } else if (command.kind === "entity.set_life_state") {
      after = { ...before, life_state: command.lifeState, died_at: command.lifeState === "dead" ? command.context.occurredAt : null, updated_at: command.context.occurredAt }
    } else if (command.kind === "entity.set_visibility") {
      after = { ...before, visibility_mode: command.visibilityMode, visibility: command.visibilityMode === "private" ? "private" : "campaign", updated_at: command.context.occurredAt }
    } else {
      throw new EngineCommandError("entity.unsupported_command", `Unsupported Shapoklyak command: ${command satisfies never}`)
    }
    this.entities.set(characterId, after)
    return { kind: command.kind, characterIds: [characterId], before, after: copy(after), requiresResolution: command.kind !== "entity.set_visibility" }
  }
}
