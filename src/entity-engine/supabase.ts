import type { SupabaseClient } from "@supabase/supabase-js"
import { EngineCommandError } from "../engine-contracts/index.ts"
import type { CharacterEntity, EntityMutation, ShapoklyakCommand, ShapoklyakStorage } from "./types.ts"

const fields = "id,campaign_id,assigned_user_id,name,character_class,level,bio,avatar_url,character_type,visibility,visibility_mode,life_state,died_at,created_by,created_at,updated_at"

function fail(error: { message: string } | null, fallback: string): never {
  throw new EngineCommandError("entity.persistence", error?.message || fallback)
}

export class SupabaseShapoklyakStorage implements ShapoklyakStorage {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) { this.client = client }

  async listCampaignEntities(campaignId: string): Promise<CharacterEntity[]> {
    const { data, error } = await this.client.from("characters").select(fields).eq("campaign_id", campaignId).order("created_at", { ascending: true })
    if (error) fail(error, "Could not load characters")
    return (data || []) as CharacterEntity[]
  }

  async getEntity(characterId: string): Promise<CharacterEntity | null> {
    const { data, error } = await this.client.from("characters").select(fields).eq("id", characterId).maybeSingle()
    if (error) fail(error, "Could not load character")
    return data as CharacterEntity | null
  }

  async execute(command: ShapoklyakCommand): Promise<EntityMutation> {
    if (command.kind === "entity.create") {
      const { data, error } = await this.client.rpc("create_campaign_character", {
        p_campaign_id: command.context.campaignId,
        p_name: command.input.name.trim(),
        p_character_class: command.input.character_class.trim() || "Персонаж",
        p_level: command.input.level,
        p_bio: command.input.bio.trim(),
        p_avatar_url: command.input.avatar_url?.trim() || null,
        p_assigned_user_id: command.input.assigned_user_id,
        p_character_type: command.input.character_type,
        p_visibility: command.input.visibility,
      })
      if (error) fail(error, "Could not create character")
      const after = await this.getEntity(String(data))
      return { kind: command.kind, characterIds: [String(data)], before: null, after, requiresResolution: true }
    }

    if (command.kind === "entity.set_active") {
      const { error } = await this.client.rpc("set_campaign_active_character", { p_campaign_id: command.context.campaignId, p_user_id: command.userId, p_character_id: command.characterId })
      if (error) fail(error, "Could not set active character")
      return { kind: command.kind, characterIds: command.characterId ? [command.characterId] : [], details: { userId: command.userId, activeCharacterId: command.characterId }, requiresResolution: false }
    }

    if (command.kind === "entity.reveal_npc") {
      const { error } = await this.client.rpc("set_world_discovery", { p_character_id: command.viewerCharacterId, p_entity_type: "npc", p_entity_id: command.npcCharacterId, p_discovered: command.discovered })
      if (error) fail(error, "Could not update NPC discovery")
      return { kind: command.kind, characterIds: [command.viewerCharacterId, command.npcCharacterId], details: { discovered: command.discovered }, requiresResolution: false }
    }

    const before = await this.getEntity(command.characterId)
    if (!before) throw new EngineCommandError("entity.not_found", "Character was not found")

    if (command.kind === "entity.update") {
      const { error } = await this.client.rpc("update_campaign_character", {
        p_character_id: command.characterId,
        p_name: command.input.name.trim(),
        p_character_class: command.input.character_class.trim() || "Персонаж",
        p_level: command.input.level,
        p_bio: command.input.bio.trim(),
        p_avatar_url: command.input.avatar_url?.trim() || null,
        p_assigned_user_id: command.input.assigned_user_id,
        p_character_type: command.input.character_type,
        p_visibility: command.input.visibility,
      })
      if (error) fail(error, "Could not update character")
      return { kind: command.kind, characterIds: [command.characterId], before, after: await this.getEntity(command.characterId), requiresResolution: true }
    }

    if (command.kind === "entity.delete") {
      const { error } = await this.client.rpc("delete_campaign_character", { p_character_id: command.characterId })
      if (error) fail(error, "Could not delete character")
      return { kind: command.kind, characterIds: [command.characterId], before, after: null, requiresResolution: true }
    }

    if (command.kind === "entity.set_life_state") {
      const { error } = await this.client.rpc("set_character_life_state", { p_character_id: command.characterId, p_life_state: command.lifeState })
      if (error) fail(error, "Could not change character life state")
      return { kind: command.kind, characterIds: [command.characterId], before, after: await this.getEntity(command.characterId), requiresResolution: true }
    }

    if (command.kind === "entity.set_visibility") {
      const { error } = await this.client.rpc("set_character_visibility_mode", { p_character_id: command.characterId, p_visibility_mode: command.visibilityMode })
      if (error) fail(error, "Could not change character visibility")
      return { kind: command.kind, characterIds: [command.characterId], before, after: await this.getEntity(command.characterId), requiresResolution: false }
    }

    if (command.kind === "entity.assign_template") {
      const { data, error } = await this.client.rpc("set_character_template_assignment_owner_v1", {
        p_character_id: command.characterId,
        p_template_id: command.input.templateId,
        p_template_level: command.input.templateLevel,
        p_selected_choices: command.input.selectedChoices,
      })
      if (error) fail(error, "Could not assign character template")
      return {
        kind: command.kind,
        characterIds: [command.characterId],
        before,
        after: await this.getEntity(command.characterId),
        details: { assignmentId: String(data), templateId: command.input.templateId, templateLevel: command.input.templateLevel },
        requiresResolution: true,
      }
    }

    if (command.kind === "entity.remove_template_assignment") {
      const { error } = await this.client.rpc("remove_character_template_assignment_owner_v1", {
        p_character_id: command.characterId,
        p_assignment_id: command.assignmentId,
      })
      if (error) fail(error, "Could not remove character template assignment")
      return {
        kind: command.kind,
        characterIds: [command.characterId],
        before,
        after: await this.getEntity(command.characterId),
        details: { assignmentId: command.assignmentId },
        requiresResolution: true,
      }
    }

    if (command.kind === "entity.set_source_suppressed") {
      const { error } = await this.client.rpc("set_character_source_suppressed", {
        p_character_id: command.characterId,
        p_source_id: command.sourceId,
        p_suppressed: command.suppressed,
      })
      if (error) fail(error, "Could not change character source suppression")
      return {
        kind: command.kind,
        characterIds: [command.characterId],
        before,
        after: before,
        details: { sourceId: command.sourceId, suppressed: command.suppressed },
        requiresResolution: true,
      }
    }

    if (command.kind === "entity.set_hp") {
      const { error } = await this.client.rpc("set_character_hp_v1", {
        p_character_id: command.characterId,
        p_current_hp: command.currentHp,
        p_max_hp: command.maxHp ?? null,
        p_temp_hp: command.tempHp ?? null,
        p_command_id: command.context.commandId,
      })
      if (error) fail(error, "Could not set character HP")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { currentHp: command.currentHp, maxHp: command.maxHp, tempHp: command.tempHp }, requiresResolution: true }
    }

    throw new EngineCommandError("entity.unsupported_command", "Unsupported Shapoklyak command")
  }
}
