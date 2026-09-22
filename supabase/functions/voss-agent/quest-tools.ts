import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"
import type { VossAuthority } from "./authority.ts"

type JsonRecord = Record<string, unknown>

export type VossQuestToolContext = {
  client: SupabaseClient
  campaignId: string
  userId: string
  authority: VossAuthority
}

const CONDITION_TYPES = [
  "visit_location",
  "discover_location",
  "meet_npc",
  "talk_to_npc",
  "discover_npc",
  "inventory_has",
  "deliver_item",
  "event_occurred",
  "character_state",
  "custom_narrative",
] as const

const QUEST_STATUSES = [
  "draft",
  "active",
  "completed",
  "failed",
  "cancelled",
] as const

const TARGET_KINDS = ["location", "npc", "item"] as const

export const VOSS_QUEST_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_quests",
      description:
        "GM/Admin only. List Quest Engine quests in the current campaign. Use this before editing an existing quest when its quest_id is not already known.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          status: { type: "string", enum: QUEST_STATUSES },
          query: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_quest_plan",
      description:
        "GM/Admin only. Atomically create one complete hidden Quest Engine plan as a DRAFT. Provide all planned stages, secret notes, placeholders and structured conditions in this single call. Prefer placeholders such as 'Где-то в лесу' instead of creating NPCs, locations or items that do not yet need to exist. quest_key is the idempotency key: retry the same plan with the same key rather than inventing a new key. This tool does not activate the quest; use activate_quest separately when the player should receive it.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          quest_key: { type: "string" },
          title: { type: "string" },
          player_brief: { type: "string" },
          primary_character_id: { type: "string" },
          participant_character_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          sort_order: { type: "integer", minimum: 0, maximum: 100000 },
          secret: {
            type: "object",
            additionalProperties: false,
            properties: {
              internal_summary: { type: "string" },
              gm_notes: { type: "string" },
              ai_directive: { type: "string" },
            },
          },
          targets: {
            type: "array",
            maxItems: 96,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                target_key: { type: "string" },
                stage_key: { type: "string" },
                target_kind: { type: "string", enum: TARGET_KINDS },
                placeholder_label: { type: "string" },
                internal_note: { type: "string" },
                location_id: { type: "string" },
                npc_character_id: { type: "string" },
                item_definition_id: { type: "string" },
              },
              required: [
                "target_key",
                "target_kind",
                "placeholder_label",
              ],
            },
          },
          stages: {
            type: "array",
            minItems: 1,
            maxItems: 32,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                stage_key: { type: "string" },
                player_title: {
                  type: "string",
                  description:
                    "Text that becomes visible only after this stage is completed.",
                },
                completion_text: {
                  type: "string",
                  description:
                    "Player-facing result revealed only after completion.",
                },
                secret: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    internal_title: { type: "string" },
                    objective: { type: "string" },
                    gm_notes: { type: "string" },
                  },
                },
                condition_groups: {
                  type: "array",
                  maxItems: 24,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      group_key: { type: "string" },
                      mode: { type: "string", enum: ["all", "any"] },
                      conditions: {
                        type: "array",
                        maxItems: 32,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            condition_key: { type: "string" },
                            condition_type: {
                              type: "string",
                              enum: CONDITION_TYPES,
                            },
                            target_key: { type: "string" },
                            required_quantity: {
                              type: "integer",
                              minimum: 1,
                            },
                            negated: { type: "boolean" },
                            params: {
                              type: "object",
                              additionalProperties: true,
                            },
                          },
                          required: [
                            "condition_key",
                            "condition_type",
                          ],
                        },
                      },
                    },
                    required: ["group_key", "conditions"],
                  },
                },
              },
              required: ["stage_key", "secret", "condition_groups"],
            },
          },
        },
        required: [
          "quest_key",
          "title",
          "primary_character_id",
          "secret",
          "stages",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_quest_plan",
      description:
        "GM/Admin only. Read the complete hidden Quest Engine plan, including future stages, secret notes, placeholders, condition groups and current resolver state. Use quest_id when known, otherwise quest_key.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          quest_id: { type: "string" },
          quest_key: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "activate_quest",
      description:
        "GM/Admin only. Publish a draft quest to its assigned character(s), activate its first planned stage, then run the Quest Resolver. Do this only when the quest should actually enter play.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          quest_id: { type: "string" },
          quest_key: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_quest_brief",
      description:
        "GM/Admin only. Update the player-safe quest title and/or current player_brief. This never edits hidden future stages or GM notes.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          quest_id: { type: "string" },
          quest_key: { type: "string" },
          title: { type: "string" },
          player_brief: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bind_quest_target",
      description:
        "GM/Admin only. Bind an existing quest placeholder to a canonical location, NPC or item definition, or set entity_id to null to return it to placeholder state. Do not create a world entity merely to satisfy this tool.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          quest_id: { type: "string" },
          quest_key: { type: "string" },
          target_key: { type: "string" },
          entity_id: { type: ["string", "null"] },
        },
        required: ["target_key", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_quest_condition",
      description:
        "GM/Admin AI-GM only. Resolve a custom_narrative condition when campaign events or scene evidence justify the narrative conclusion. Never use this for automatic condition types such as inventory_has or discover_location; the Quest Resolver owns those. Include a concise evidence note.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          condition_id: { type: "string" },
          satisfied: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["condition_id", "satisfied", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_quest_resolver",
      description:
        "GM/Admin only. Explicitly re-check the current quest against canonical world state. Normally triggers do this automatically; use after a related manual change or when verifying progress.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          quest_id: { type: "string" },
          quest_key: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_quest",
      description:
        "GM/Admin only. Explicitly close a quest as completed, failed or cancelled. completed is accepted only when all stages are already completed/skipped; normal successful completion should usually be left to the Quest Resolver.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          quest_id: { type: "string" },
          quest_key: { type: "string" },
          status: {
            type: "string",
            enum: ["completed", "failed", "cancelled"],
          },
          note: { type: "string" },
        },
        required: ["status"],
      },
    },
  },
] as const

const TOOL_NAMES = new Set(VOSS_QUEST_TOOLS.map((tool) => tool.function.name))
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isVossQuestTool(name: string) {
  return TOOL_NAMES.has(name)
}

function canManage(context: VossQuestToolContext) {
  return context.authority === "gm" || context.authority === "admin"
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function uuid(value: unknown) {
  const valueText = text(value, 80)
  return UUID_RE.test(valueText) ? valueText : ""
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function cleanSearch(value: unknown) {
  return text(value, 160)
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 6) return null
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") return value.slice(0, 6000)
  if (Array.isArray(value)) {
    return value.slice(0, 64).map((entry) => sanitizeJson(entry, depth + 1))
  }
  if (value && typeof value === "object") {
    const output: JsonRecord = {}
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, 64)) {
      const key = rawKey.slice(0, 96)
      if (key) output[key] = sanitizeJson(rawValue, depth + 1)
    }
    return output
  }
  return null
}

function object(value: unknown) {
  const result = sanitizeJson(value)
  return result && typeof result === "object" && !Array.isArray(result)
    ? result as JsonRecord
    : {}
}

function uniqueUuids(value: unknown, max: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .map((entry) => uuid(entry))
      .filter(Boolean),
  )].slice(0, max)
}

function cleanCondition(raw: unknown) {
  const row = object(raw)
  const type = text(row.condition_type, 80)
  if (!(CONDITION_TYPES as readonly string[]).includes(type)) {
    return null
  }

  const targetKey = text(row.target_key, 120)
  const params = object(row.params)
  return {
    condition_key: text(row.condition_key, 120),
    condition_type: type,
    ...(targetKey ? { target_key: targetKey } : {}),
    required_quantity: boundedInt(row.required_quantity, 1, 1, 100000),
    negated: row.negated === true,
    params,
  }
}

function cleanGroup(raw: unknown) {
  const row = object(raw)
  const conditions = Array.isArray(row.conditions)
    ? row.conditions.slice(0, 32).map(cleanCondition).filter(Boolean)
    : []

  return {
    group_key: text(row.group_key, 120),
    mode: row.mode === "any" ? "any" : "all",
    conditions,
  }
}

function cleanStage(raw: unknown) {
  const row = object(raw)
  const secret = object(row.secret)
  const groups = Array.isArray(row.condition_groups)
    ? row.condition_groups.slice(0, 24).map(cleanGroup)
    : []

  return {
    stage_key: text(row.stage_key, 120),
    player_title: text(row.player_title, 240),
    completion_text: text(row.completion_text, 6000),
    secret: {
      internal_title: text(secret.internal_title, 240),
      objective: text(secret.objective, 12000),
      gm_notes: text(secret.gm_notes, 24000),
    },
    condition_groups: groups,
  }
}

function cleanTarget(raw: unknown) {
  const row = object(raw)
  const kind = text(row.target_kind, 24)
  if (!(TARGET_KINDS as readonly string[]).includes(kind)) return null

  const stageKey = text(row.stage_key, 120)
  const locationId = uuid(row.location_id)
  const npcCharacterId = uuid(row.npc_character_id)
  const itemDefinitionId = uuid(row.item_definition_id)

  return {
    target_key: text(row.target_key, 120),
    ...(stageKey ? { stage_key: stageKey } : {}),
    target_kind: kind,
    placeholder_label: text(row.placeholder_label, 240),
    internal_note: text(row.internal_note, 12000),
    ...(locationId ? { location_id: locationId } : {}),
    ...(npcCharacterId ? { npc_character_id: npcCharacterId } : {}),
    ...(itemDefinitionId ? { item_definition_id: itemDefinitionId } : {}),
  }
}

async function resolveQuestId(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const direct = uuid(args.quest_id)
  const questKey = text(args.quest_key, 120)

  let query = context.client
    .from("quests")
    .select("id,campaign_id,quest_key,title,status")
    .eq("campaign_id", context.campaignId)

  if (direct) query = query.eq("id", direct)
  else if (questKey) query = query.eq("quest_key", questKey)
  else return { error: "quest_id_or_quest_key_required", row: null }

  const { data, error } = await query.maybeSingle()
  if (error) return { error: error.message, row: null }
  if (!data) return { error: "quest_not_found", row: null }
  return { error: "", row: data }
}

async function readPlan(context: VossQuestToolContext, questId: string) {
  const { data, error } = await context.client.rpc(
    "read_quest_plan_v1",
    { p_quest_id: questId },
  )
  if (error) return { error: error.message }
  return { quest_id: questId, plan: data }
}

async function listQuests(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const status = text(args.status, 24)
  const queryText = cleanSearch(args.query)
  const limit = boundedInt(args.limit, 30, 1, 50)

  let questIds: string[] | null = null
  if (args.character_id !== undefined) {
    if (!characterId) return { error: "character_id_invalid" }
    const { data: links, error: linksError } = await context.client
      .from("quest_characters")
      .select("quest_id")
      .eq("character_id", characterId)
      .limit(200)

    if (linksError) return { error: linksError.message }
    questIds = (links || [])
      .map((row) => typeof row.quest_id === "string" ? row.quest_id : "")
      .filter(Boolean)
    if (!questIds.length) return { quests: [] }
  }

  let query = context.client
    .from("quests")
    .select("id,quest_key,title,player_brief,status,sort_order,activated_at,closed_at,created_at,updated_at")
    .eq("campaign_id", context.campaignId)

  if (questIds) query = query.in("id", questIds)
  if ((QUEST_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status)
  }
  if (queryText) {
    query = query.or(
      "title.ilike.%" + queryText + "%,quest_key.ilike.%" + queryText + "%",
    )
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) return { error: error.message }
  return { quests: data || [] }
}

async function createQuestPlan(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const primaryCharacterId = uuid(args.primary_character_id)
  if (!primaryCharacterId) return { error: "primary_character_id_required" }

  const secret = object(args.secret)
  const targets = Array.isArray(args.targets)
    ? args.targets.slice(0, 96).map(cleanTarget).filter(Boolean)
    : []
  const stages = Array.isArray(args.stages)
    ? args.stages.slice(0, 32).map(cleanStage)
    : []

  const input = {
    quest_key: text(args.quest_key, 120),
    title: text(args.title, 240),
    player_brief: text(args.player_brief, 6000),
    primary_character_id: primaryCharacterId,
    participant_character_ids: uniqueUuids(
      args.participant_character_ids,
      24,
    ),
    sort_order: boundedInt(args.sort_order, 0, 0, 100000),
    secret: {
      internal_summary: text(secret.internal_summary, 12000),
      gm_notes: text(secret.gm_notes, 24000),
      ai_directive: text(secret.ai_directive, 12000),
    },
    targets,
    stages,
  }

  if (!input.quest_key) return { error: "quest_key_required" }
  if (!input.title) return { error: "quest_title_required" }
  if (!stages.length) return { error: "quest_stages_required" }

  const { data, error } = await context.client.rpc(
    "create_quest_plan_v1",
    {
      p_campaign_id: context.campaignId,
      p_input: input,
    },
  )

  if (error) return { error: error.message }
  return {
    ...(data && typeof data === "object" ? data : { result: data }),
    canonical_state_changed: true,
    activation_required: true,
  }
}

async function readQuestPlan(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const resolved = await resolveQuestId(context, args)
  if (resolved.error || !resolved.row) return { error: resolved.error }
  return readPlan(context, resolved.row.id)
}

async function activateQuest(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const resolved = await resolveQuestId(context, args)
  if (resolved.error || !resolved.row) return { error: resolved.error }

  const { data, error } = await context.client.rpc(
    "activate_quest_v1",
    { p_quest_id: resolved.row.id },
  )
  if (error) return { error: error.message }

  return {
    ...(data && typeof data === "object" ? data : { result: data }),
    canonical_state_changed: true,
  }
}

async function updateQuestBrief(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const resolved = await resolveQuestId(context, args)
  if (resolved.error || !resolved.row) return { error: resolved.error }

  const patch: JsonRecord = {}
  if (Object.prototype.hasOwnProperty.call(args, "title")) {
    const title = text(args.title, 240)
    if (!title) return { error: "quest_title_cannot_be_empty" }
    patch.title = title
  }
  if (Object.prototype.hasOwnProperty.call(args, "player_brief")) {
    patch.player_brief = text(args.player_brief, 6000)
  }
  if (!Object.keys(patch).length) return { error: "quest_brief_patch_required" }

  const { error } = await context.client
    .from("quests")
    .update(patch)
    .eq("campaign_id", context.campaignId)
    .eq("id", resolved.row.id)

  if (error) return { error: error.message }
  return {
    ...(await readPlan(context, resolved.row.id)),
    canonical_state_changed: true,
  }
}

async function bindQuestTarget(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const resolved = await resolveQuestId(context, args)
  if (resolved.error || !resolved.row) return { error: resolved.error }

  const targetKey = text(args.target_key, 120)
  if (!targetKey) return { error: "target_key_required" }

  const { data: target, error: targetError } = await context.client
    .from("quest_targets")
    .select("id,target_kind,location_id,npc_character_id,item_definition_id")
    .eq("quest_id", resolved.row.id)
    .eq("target_key", targetKey)
    .maybeSingle()

  if (targetError) return { error: targetError.message }
  if (!target) return { error: "quest_target_not_found" }

  const entityId =
    args.entity_id === null || args.entity_id === undefined
      ? null
      : uuid(args.entity_id)
  if (args.entity_id !== null && args.entity_id !== undefined && !entityId) {
    return { error: "entity_id_invalid" }
  }

  const patch =
    target.target_kind === "location"
      ? { location_id: entityId }
      : target.target_kind === "npc"
        ? { npc_character_id: entityId }
        : { item_definition_id: entityId }

  const { error } = await context.client
    .from("quest_targets")
    .update(patch)
    .eq("quest_id", resolved.row.id)
    .eq("id", target.id)

  if (error) return { error: error.message }
  return {
    ...(await readPlan(context, resolved.row.id)),
    target_key: targetKey,
    canonical_state_changed: true,
  }
}

async function resolveQuestCondition(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const conditionId = uuid(args.condition_id)
  if (!conditionId) return { error: "condition_id_required" }

  const { data, error } = await context.client.rpc(
    "set_quest_condition_resolution_ai_v1",
    {
      p_condition_id: conditionId,
      p_satisfied: args.satisfied === true,
      p_note: text(args.note, 6000),
    },
  )
  if (error) return { error: error.message }

  return {
    ...(data && typeof data === "object" ? data : { result: data }),
    canonical_state_changed: true,
  }
}

async function runQuestResolver(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const resolved = await resolveQuestId(context, args)
  if (resolved.error || !resolved.row) return { error: resolved.error }

  const { data, error } = await context.client.rpc(
    "resolve_quest_v1",
    { p_quest_id: resolved.row.id },
  )
  if (error) return { error: error.message }

  return {
    resolver: data,
    ...(await readPlan(context, resolved.row.id)),
    canonical_state_changed: true,
  }
}

async function closeQuest(
  context: VossQuestToolContext,
  args: JsonRecord,
) {
  const resolved = await resolveQuestId(context, args)
  if (resolved.error || !resolved.row) return { error: resolved.error }

  const status = text(args.status, 24)
  if (!["completed", "failed", "cancelled"].includes(status)) {
    return { error: "quest_close_status_invalid" }
  }

  const { data, error } = await context.client.rpc(
    "close_quest_v1",
    {
      p_quest_id: resolved.row.id,
      p_status: status,
      p_note: text(args.note, 6000),
    },
  )
  if (error) return { error: error.message }

  return {
    ...(data && typeof data === "object" ? data : { result: data }),
    canonical_state_changed: true,
  }
}

export async function executeVossQuestTool(
  context: VossQuestToolContext,
  name: string,
  args: JsonRecord,
) {
  if (!canManage(context)) return { error: "gm_authority_required" }

  try {
    if (name === "list_quests") return await listQuests(context, args)
    if (name === "create_quest_plan") return await createQuestPlan(context, args)
    if (name === "read_quest_plan") return await readQuestPlan(context, args)
    if (name === "activate_quest") return await activateQuest(context, args)
    if (name === "update_quest_brief") return await updateQuestBrief(context, args)
    if (name === "bind_quest_target") return await bindQuestTarget(context, args)
    if (name === "resolve_quest_condition") return await resolveQuestCondition(context, args)
    if (name === "run_quest_resolver") return await runQuestResolver(context, args)
    if (name === "close_quest") return await closeQuest(context, args)
    return { error: "unknown_quest_tool" }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
