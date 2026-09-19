import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"
import type { VossAuthority } from "./authority.ts"

type JsonRecord = Record<string, unknown>

export type VossAdminToolContext = {
  admin: SupabaseClient
  campaignId: string
  userId: string
  authority: VossAuthority
}

export const VOSS_ADMIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_voss_security_blocks",
      description:
        "System admin only. List players whose access to Voss is currently blocked in this campaign.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_player_voss_security",
      description:
        "System admin only. Read recent Voss security events and strike state for one campaign player.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          user_id: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 30 },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unblock_player_voss",
      description:
        "System admin only. Remove a player's Voss block and reset their strike count to zero.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          user_id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_voss_system_settings",
      description:
        "System admin only. Read the AI model registry and current campaign default Voss model.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_campaign_voss_model",
      description:
        "System admin only. Set or clear the default Voss model for this campaign. The model must be an enabled campaign agent model.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          model_id: {
            type: "string",
            description: "Enabled campaign agent model id. Omit when clear=true.",
          },
          clear: {
            type: "boolean",
            description: "Set true to clear the campaign default model.",
          },
        },
      },
    },
  },
] as const

const TOOL_NAMES = new Set(VOSS_ADMIN_TOOLS.map((tool) => tool.function.name))

export function isVossAdminTool(name: string) {
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

async function playerMembership(
  context: VossAdminToolContext,
  userId: string,
) {
  const { data, error } = await context.admin
    .from("campaign_members")
    .select("user_id,role,is_owner")
    .eq("campaign_id", context.campaignId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) return { error: error.message, member: null }
  if (!data || data.is_owner === true || data.role !== "player") {
    return { error: "player_member_required", member: null }
  }
  return { error: "", member: data }
}

async function listBlocks(context: VossAdminToolContext) {
  const { data, error } = await context.admin
    .from("ai_security_states")
    .select("user_id,strike_count,blocked,blocked_at,updated_at")
    .eq("campaign_id", context.campaignId)
    .eq("blocked", true)
    .order("updated_at", { ascending: false })
  if (error) return { error: error.message }

  const userIds = (data || []).map((row) => row.user_id)
  const { data: profiles } = userIds.length
    ? await context.admin.from("profiles").select("user_id,display_name").in("user_id", userIds)
    : { data: [] }
  const names = new Map((profiles || []).map((row) => [row.user_id, row.display_name]))

  return {
    blocks: (data || []).map((row) => ({
      ...row,
      display_name: names.get(row.user_id) || null,
    })),
  }
}

async function readPlayerSecurity(
  context: VossAdminToolContext,
  args: JsonRecord,
) {
  const userId = uuid(args.user_id)
  if (!userId) return { error: "user_id_required" }
  const member = await playerMembership(context, userId)
  if (member.error) return { error: member.error }

  const limit = Math.max(1, Math.min(30, Number(args.limit) || 12))
  const [{ data: state, error: stateError }, { data: events, error: eventsError }] =
    await Promise.all([
      context.admin
        .from("ai_security_states")
        .select("strike_count,blocked,blocked_at,updated_at")
        .eq("campaign_id", context.campaignId)
        .eq("user_id", userId)
        .maybeSingle(),
      context.admin
        .from("ai_security_events")
        .select("id,thread_id,message_id,category,severity,confidence,reason,requested_capability,strike_applied,created_at")
        .eq("campaign_id", context.campaignId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit),
    ])
  if (stateError) return { error: stateError.message }
  if (eventsError) return { error: eventsError.message }

  const { data: profile } = await context.admin
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle()

  return {
    player: {
      user_id: userId,
      display_name: profile?.display_name || null,
    },
    state: state || {
      strike_count: 0,
      blocked: false,
      blocked_at: null,
    },
    events: events || [],
  }
}

async function readSystemSettings(context: VossAdminToolContext) {
  const [{ data: models, error: modelsError }, { data: setting, error: settingError }] =
    await Promise.all([
      context.admin
        .from("ai_models")
        .select("id,provider_key,model_key,display_name,enabled,model_kind,access_scope,supports_tools,supports_vision,user_selectable,gm_selectable"),
      context.admin
        .from("ai_agent_settings")
        .select("campaign_id,agent_key,selected_model_id,updated_by,updated_at")
        .eq("campaign_id", context.campaignId)
        .eq("agent_key", "voss")
        .maybeSingle(),
    ])

  if (modelsError) return { error: modelsError.message }
  if (settingError) return { error: settingError.message }

  return {
    models: models || [],
    campaign_voss: setting || null,
  }
}

async function setCampaignVossModel(
  context: VossAdminToolContext,
  args: JsonRecord,
) {
  const clear = args.clear === true
  const modelId = clear ? null : uuid(args.model_id)
  if (!clear && !modelId) return { error: "model_id_required" }

  if (modelId) {
    const { data: model, error: modelError } = await context.admin
      .from("ai_models")
      .select("id,enabled,model_kind,access_scope")
      .eq("id", modelId)
      .maybeSingle()
    if (modelError) return { error: modelError.message }
    if (
      !model ||
      model.enabled !== true ||
      model.model_kind !== "agent" ||
      model.access_scope !== "campaign"
    ) {
      return { error: "campaign_agent_model_required" }
    }
  }

  const { data, error } = await context.admin
    .from("ai_agent_settings")
    .upsert({
      campaign_id: context.campaignId,
      agent_key: "voss",
      selected_model_id: modelId,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "campaign_id,agent_key" })
    .select("campaign_id,agent_key,selected_model_id,updated_by,updated_at")
    .single()

  if (error) return { error: error.message }
  return { settings: data }
}

async function unblockPlayer(
  context: VossAdminToolContext,
  args: JsonRecord,
) {
  const userId = uuid(args.user_id)
  if (!userId) return { error: "user_id_required" }
  const member = await playerMembership(context, userId)
  if (member.error) return { error: member.error }

  const reason = text(args.reason, 800) || "Разблокировано системным администратором."

  const { error } = await context.admin
    .from("ai_security_states")
    .upsert({
      campaign_id: context.campaignId,
      user_id: userId,
      strike_count: 0,
      blocked: false,
      blocked_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "campaign_id,user_id" })

  if (error) return { error: error.message }

  await context.admin.from("ai_security_events").insert({
    campaign_id: context.campaignId,
    user_id: userId,
    category: "other",
    severity: 0,
    confidence: 1,
    reason,
    requested_capability: "admin_unblock",
    strike_applied: false,
  }).then(() => undefined).catch(() => undefined)

  return {
    user_id: userId,
    strike_count: 0,
    blocked: false,
    reason,
  }
}

export async function executeVossAdminTool(
  context: VossAdminToolContext,
  name: string,
  args: JsonRecord,
) {
  if (context.authority !== "admin") return { error: "system_admin_required" }

  try {
    if (name === "list_voss_security_blocks") return await listBlocks(context)
    if (name === "read_player_voss_security") return await readPlayerSecurity(context, args)
    if (name === "unblock_player_voss") return await unblockPlayer(context, args)
    if (name === "read_voss_system_settings") return await readSystemSettings(context)
    if (name === "set_campaign_voss_model") return await setCampaignVossModel(context, args)
    return { error: "unknown_admin_tool" }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
