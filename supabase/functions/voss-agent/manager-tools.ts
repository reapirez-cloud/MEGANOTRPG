import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"
import type { VossAuthority } from "./authority.ts"

type JsonRecord = Record<string, unknown>

export type VossManagerToolContext = {
  client: SupabaseClient
  admin: SupabaseClient
  campaignId: string
  userId: string
  authority: VossAuthority
}

export const VOSS_MANAGER_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_workshop_character",
      description:
        "GM/Admin only. Create a future PC or NPC directly in the Workshop Draft section. The character remains private draft content until separately published.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_type: { type: "string", enum: ["pc", "npc"] },
          name: { type: "string" },
          character_class: { type: "string" },
          level: { type: "integer", minimum: 1, maximum: 30 },
          bio: { type: "string" },
        },
        required: ["character_type", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_campaign_character",
      description:
        "GM/Admin only. Edit an existing campaign or Workshop character. Read the character first and send only intended fields.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          name: { type: "string" },
          character_type: { type: "string", enum: ["pc", "npc"] },
          character_class: { type: "string" },
          level: { type: "integer", minimum: 1, maximum: 30 },
          bio: { type: "string" },
        },
        required: ["character_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_life_state",
      description:
        "GM/Admin only. Mark an existing character alive or dead. Use only when the GM/Admin explicitly asks to change canonical life state.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          life_state: { type: "string", enum: ["alive", "dead"] },
        },
        required: ["character_id", "life_state"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_publication",
      description:
        "GM/Admin only. Move a character between Workshop Draft and published campaign state. Draft always becomes private and unassigned.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          publication_state: { type: "string", enum: ["draft", "campaign"] },
          visibility_mode: { type: "string", enum: ["always", "discover"] },
        },
        required: ["character_id", "publication_state"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_location",
      description:
        "GM/Admin only. Create a canonical location/zone in the campaign world. May be nested under an existing parent location.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          parent_location_id: { type: "string" },
          name: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
          visibility_mode: {
            type: "string",
            enum: ["always", "discover", "private"],
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_location",
      description:
        "GM/Admin only. Edit an existing canonical location/zone. Read it first and change only requested fields.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          location_id: { type: "string" },
          parent_location_id: { type: "string" },
          name: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
          visibility_mode: {
            type: "string",
            enum: ["always", "discover", "private"],
          },
        },
        required: ["location_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_location_archived",
      description:
        "GM/Admin only. Archive or restore a location without deleting it.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          location_id: { type: "string" },
          archived: { type: "boolean" },
        },
        required: ["location_id", "archived"],
      },
    },
  },
] as const

const TOOL_NAMES = new Set(VOSS_MANAGER_TOOLS.map((tool) => tool.function.name))

export function isVossManagerTool(name: string) {
  return TOOL_NAMES.has(name)
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function uuid(value: unknown) {
  const result = text(value, 80)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)
    ? result
    : ""
}

function level(value: unknown, fallback = 1) {
  const parsed = Number(value)
  return Number.isInteger(parsed)
    ? Math.max(1, Math.min(30, parsed))
    : fallback
}

function managerClient(context: VossManagerToolContext) {
  return context.authority === "admin" ? context.admin : context.client
}

function canManage(context: VossManagerToolContext) {
  return context.authority === "gm" || context.authority === "admin"
}

async function readCharacter(context: VossManagerToolContext, characterId: string) {
  const { data, error } = await managerClient(context)
    .from("characters")
    .select("id,campaign_id,assigned_user_id,name,character_class,level,bio,avatar_url,character_type,visibility,visibility_mode,publication_state,life_state,died_at")
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)
    .maybeSingle()
  if (error) return { error: error.message as string, row: null }
  return { error: "", row: data || null }
}

async function createWorkshopCharacter(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const name = text(args.name, 160)
  if (!name) return { error: "character_name_required" }
  const characterType = args.character_type === "npc" ? "npc" : "pc"

  const { data, error } = await managerClient(context)
    .from("characters")
    .insert({
      campaign_id: context.campaignId,
      assigned_user_id: null,
      name,
      character_class: text(args.character_class, 120) || "Персонаж",
      level: level(args.level, 1),
      bio: text(args.bio, 12000),
      avatar_url: null,
      character_type: characterType,
      visibility: "private",
      visibility_mode: "private",
      publication_state: "draft",
      created_by: context.userId,
    })
    .select("id,name,character_type,publication_state,visibility_mode")
    .single()

  if (error) return { error: error.message }
  return { character: data, canonical_state_changed: true, surface: "workshop_draft" }
}

async function updateCampaignCharacter(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const row = current.row
  const characterType =
    args.character_type === "npc"
      ? "npc"
      : args.character_type === "pc"
        ? "pc"
        : row.character_type
  const patch: JsonRecord = {
    name: text(args.name, 160) || row.name,
    character_class:
      args.character_class === undefined
        ? row.character_class
        : text(args.character_class, 120) || "Персонаж",
    level: args.level === undefined ? row.level : level(args.level, row.level),
    bio: args.bio === undefined ? row.bio : text(args.bio, 12000),
    character_type: characterType,
    updated_at: new Date().toISOString(),
  }
  if (characterType === "npc") patch.assigned_user_id = null
  if (row.publication_state === "draft") {
    patch.assigned_user_id = null
    patch.visibility = "private"
    patch.visibility_mode = "private"
  }

  const { data, error } = await managerClient(context)
    .from("characters")
    .update(patch)
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)
    .select("id,name,character_type,character_class,level,bio,publication_state,visibility_mode,life_state")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { character: data, canonical_state_changed: true }
}

async function setCharacterLifeState(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const lifeState = args.life_state === "dead" ? "dead" : "alive"
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const { data, error } = await managerClient(context)
    .from("characters")
    .update({
      life_state: lifeState,
      died_at:
        lifeState === "dead"
          ? current.row.died_at || new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)
    .select("id,name,life_state,died_at")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { character: data, canonical_state_changed: true }
}

async function setCharacterPublication(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const state = args.publication_state === "campaign" ? "campaign" : "draft"
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const visibility =
    current.row.character_type === "npc" && args.visibility_mode === "always"
      ? "always"
      : current.row.character_type === "npc"
        ? "discover"
        : "always"

  const patch = state === "draft"
    ? {
        publication_state: "draft",
        assigned_user_id: null,
        visibility: "private",
        visibility_mode: "private",
        updated_at: new Date().toISOString(),
      }
    : {
        publication_state: "campaign",
        visibility: "campaign",
        visibility_mode: visibility,
        updated_at: new Date().toISOString(),
      }

  if (state === "draft" && current.row.assigned_user_id) {
    await managerClient(context)
      .from("campaign_members")
      .update({ active_character_id: null })
      .eq("campaign_id", context.campaignId)
      .eq("active_character_id", characterId)
  }

  const { data, error } = await managerClient(context)
    .from("characters")
    .update(patch)
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)
    .select("id,name,character_type,publication_state,visibility_mode,assigned_user_id")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { character: data, canonical_state_changed: true }
}

async function createLocation(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const name = text(args.name, 160)
  if (!name) return { error: "location_name_required" }
  const parentLocationId = args.parent_location_id ? uuid(args.parent_location_id) : null
  if (args.parent_location_id && !parentLocationId) return { error: "parent_location_id_invalid" }
  const visibility =
    args.visibility_mode === "always" || args.visibility_mode === "private"
      ? args.visibility_mode
      : "discover"

  if (parentLocationId) {
    const { data: parent, error: parentError } = await managerClient(context)
      .from("locations")
      .select("id")
      .eq("campaign_id", context.campaignId)
      .eq("id", parentLocationId)
      .maybeSingle()
    if (parentError) return { error: parentError.message }
    if (!parent) return { error: "parent_location_not_found" }
  }

  const { data, error } = await managerClient(context)
    .from("locations")
    .insert({
      campaign_id: context.campaignId,
      parent_location_id: parentLocationId,
      name,
      summary: text(args.summary, 2000),
      description: text(args.description, 12000),
      image_url: null,
      visibility_mode: visibility,
      lifecycle_state: "active",
      created_by: context.userId,
    })
    .select("id,parent_location_id,name,summary,description,visibility_mode,lifecycle_state")
    .single()

  if (error) return { error: error.message }
  return { location: data, canonical_state_changed: true }
}

async function updateLocation(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const locationId = uuid(args.location_id)
  if (!locationId) return { error: "location_id_required" }

  const { data: current, error: readError } = await managerClient(context)
    .from("locations")
    .select("id,parent_location_id,name,summary,description,visibility_mode,lifecycle_state")
    .eq("campaign_id", context.campaignId)
    .eq("id", locationId)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!current) return { not_found: true }

  let parentLocationId = current.parent_location_id
  if (Object.prototype.hasOwnProperty.call(args, "parent_location_id")) {
    if (args.parent_location_id === null) parentLocationId = null
    else {
      const parsed = uuid(args.parent_location_id)
      if (!parsed || parsed === locationId) return { error: "parent_location_id_invalid" }
      const { data: parent, error: parentError } = await managerClient(context)
        .from("locations")
        .select("id")
        .eq("campaign_id", context.campaignId)
        .eq("id", parsed)
        .maybeSingle()
      if (parentError) return { error: parentError.message }
      if (!parent) return { error: "parent_location_not_found" }
      parentLocationId = parsed
    }
  }

  const visibility =
    args.visibility_mode === "always" ||
      args.visibility_mode === "discover" ||
      args.visibility_mode === "private"
      ? args.visibility_mode
      : current.visibility_mode

  const { data, error } = await managerClient(context)
    .from("locations")
    .update({
      parent_location_id: parentLocationId,
      name: args.name === undefined ? current.name : text(args.name, 160) || current.name,
      summary: args.summary === undefined ? current.summary : text(args.summary, 2000),
      description: args.description === undefined ? current.description : text(args.description, 12000),
      visibility_mode: visibility,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", context.campaignId)
    .eq("id", locationId)
    .select("id,parent_location_id,name,summary,description,visibility_mode,lifecycle_state")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { location: data, canonical_state_changed: true }
}

async function setLocationArchived(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const locationId = uuid(args.location_id)
  if (!locationId) return { error: "location_id_required" }
  const archived = args.archived === true
  const { data, error } = await managerClient(context)
    .from("locations")
    .update({
      lifecycle_state: archived ? "archived" : "active",
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", context.campaignId)
    .eq("id", locationId)
    .select("id,name,lifecycle_state,archived_at")
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { location: data, canonical_state_changed: true }
}

export async function executeVossManagerTool(
  context: VossManagerToolContext,
  name: string,
  args: JsonRecord,
) {
  if (!canManage(context)) return { error: "gm_authority_required" }

  try {
    if (name === "create_workshop_character") return await createWorkshopCharacter(context, args)
    if (name === "update_campaign_character") return await updateCampaignCharacter(context, args)
    if (name === "set_character_life_state") return await setCharacterLifeState(context, args)
    if (name === "set_character_publication") return await setCharacterPublication(context, args)
    if (name === "create_location") return await createLocation(context, args)
    if (name === "update_location") return await updateLocation(context, args)
    if (name === "set_location_archived") return await setLocationArchived(context, args)
    return { error: "unknown_manager_tool" }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
