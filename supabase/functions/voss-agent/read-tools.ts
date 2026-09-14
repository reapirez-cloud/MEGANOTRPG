import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

type JsonObject = Record<string, unknown>

export type VossReadToolContext = {
  client: SupabaseClient
  campaignId: string
  userId: string
  canManage: boolean
}

export const VOSS_READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_entities",
      description:
        "Find visible MEGANOT entities by name. Use this before a read_* tool when the user names an entity but its id is unknown.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Name or short search phrase.",
          },
          types: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "character",
                "location",
                "rule_template",
                "reference_definition",
                "world_article",
                "gm_material",
              ],
            },
            description: "Optional entity types to search.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_character",
      description:
        "Read the visible resolved data stored for one character: sheet, HP, resources, inventory, spells, features, class/subclass assignments and world position.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
        },
        required: ["character_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_location",
      description:
        "Read one visible location with its text sections, parent, children and visible transitions.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          location_id: { type: "string" },
        },
        required: ["location_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_rule_template",
      description:
        "Read one campaign rule template such as a class, subclass, feature or other runtime template, including mechanics and child templates.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          template_id: { type: "string" },
        },
        required: ["template_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_reference_definition",
      description:
        "Read one visible Chasovoy canonical definition and its current revision, including exact rules text, mechanics and structured data.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          definition_id: { type: "string" },
        },
        required: ["definition_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_workspace_file",
      description:
        "Read one GM workspace note/file metadata visible to the current user. File binary content is never returned.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          file_id: { type: "string" },
        },
        required: ["file_id"],
      },
    },
  },
] as const

function cleanSearch(value: unknown) {
  if (typeof value !== "string") return ""
  return value
    .trim()
    .slice(0, 120)
    .replace(/[%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function boundedLimit(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 6
  return Math.max(1, Math.min(10, Math.floor(parsed)))
}

function requestedTypes(value: unknown) {
  const allowed = new Set([
    "character",
    "location",
    "rule_template",
    "reference_definition",
    "world_article",
    "gm_material",
  ])
  if (!Array.isArray(value)) return allowed
  const selected = value.filter(
    (item): item is string => typeof item === "string" && allowed.has(item),
  )
  return selected.length ? new Set(selected) : allowed
}

async function searchEntities(
  context: VossReadToolContext,
  args: JsonObject,
) {
  const query = cleanSearch(args.query)
  if (!query) return { error: "search query is empty" }

  const limit = boundedLimit(args.limit)
  const types = requestedTypes(args.types)
  const pattern = "%" + query + "%"
  const jobs: Array<Promise<{ type: string; rows: unknown[]; error?: string }>> = []

  if (types.has("character")) {
    jobs.push(
      context.client
        .from("characters")
        .select("id,name,character_class,level,character_type,life_state,publication_state,visibility_mode")
        .eq("campaign_id", context.campaignId)
        .ilike("name", pattern)
        .order("name")
        .limit(limit)
        .then(({ data, error }) => ({
          type: "character",
          rows: data || [],
          error: error?.message,
        })),
    )
  }

  if (types.has("location")) {
    jobs.push(
      context.client
        .from("locations")
        .select("id,name,summary,parent_location_id,visibility_mode,lifecycle_state")
        .eq("campaign_id", context.campaignId)
        .ilike("name", pattern)
        .order("name")
        .limit(limit)
        .then(({ data, error }) => ({
          type: "location",
          rows: data || [],
          error: error?.message,
        })),
    )
  }

  if (types.has("rule_template")) {
    jobs.push(
      context.client
        .from("rule_templates")
        .select("id,kind,slug,name,description,parent_template_id,unlock_level,mechanical_summary,is_active")
        .eq("campaign_id", context.campaignId)
        .ilike("name", pattern)
        .order("kind")
        .order("name")
        .limit(limit)
        .then(({ data, error }) => ({
          type: "rule_template",
          rows: data || [],
          error: error?.message,
        })),
    )
  }

  if (types.has("reference_definition")) {
    jobs.push(
      (async () => {
        const { data: revisions, error } = await context.client
          .from("reference_definition_revisions")
          .select("definition_id,revision,name,summary")
          .ilike("name", pattern)
          .order("name")
          .limit(limit)

        if (error) {
          return {
            type: "reference_definition",
            rows: [],
            error: error.message,
          }
        }

        const ids = [...new Set((revisions || []).map((row) => row.definition_id))]
        if (!ids.length) {
          return { type: "reference_definition", rows: [] }
        }

        const { data: definitions, error: definitionError } = await context.client
          .from("reference_definitions")
          .select("id,kind,scope,campaign_id,slug,visibility,status,current_revision,source_kind,source_label")
          .in("id", ids)
          .limit(limit)

        const byId = new Map((definitions || []).map((row) => [row.id, row]))
        return {
          type: "reference_definition",
          rows: (revisions || [])
            .map((revision) => ({
              ...(byId.get(revision.definition_id) || {}),
              ...revision,
            }))
            .filter((row) => row.id),
          error: definitionError?.message,
        }
      })(),
    )
  }

  if (types.has("world_article")) {
    jobs.push(
      context.client
        .from("world_articles")
        .select("id,title,summary,section_id")
        .eq("campaign_id", context.campaignId)
        .ilike("title", pattern)
        .order("title")
        .limit(limit)
        .then(({ data, error }) => ({
          type: "world_article",
          rows: data || [],
          error: error?.message,
        })),
    )
  }

  if (types.has("gm_material") && context.canManage) {
    jobs.push(
      context.client
        .from("gm_workspace_files")
        .select("id,folder_id,kind,title,body,original_name,mime_type,updated_at")
        .eq("campaign_id", context.campaignId)
        .eq("workspace_user_id", context.userId)
        .ilike("title", pattern)
        .order("updated_at", { ascending: false })
        .limit(limit)
        .then(({ data, error }) => ({
          type: "gm_material",
          rows: data || [],
          error: error?.message,
        })),
    )
  }

  const groups = await Promise.all(jobs)
  return {
    query,
    groups: groups.filter((group) => group.rows.length || group.error),
  }
}

async function readCharacter(
  context: VossReadToolContext,
  args: JsonObject,
) {
  const characterId = typeof args.character_id === "string" ? args.character_id : ""
  if (!characterId) return { error: "character_id is required" }

  const { data: character, error: characterError } = await context.client
    .from("characters")
    .select("id,campaign_id,assigned_user_id,name,character_class,level,bio,character_type,life_state,visibility_mode,publication_state")
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)
    .maybeSingle()

  if (characterError) return { error: characterError.message }
  if (!character) return { not_found: true }

  const [
    sheetResult,
    inventoryResult,
    spellsResult,
    featuresResult,
    resourceResult,
    assignmentResult,
    worldStateResult,
  ] = await Promise.all([
    context.client.from("character_sheets").select("*").eq("character_id", characterId).maybeSingle(),
    context.client
      .from("character_inventory_items")
      .select("id,name,quantity,weight,equipped,category,equipment_slot,description,definition_id,definition_revision,mechanics,usage_mode,charges_current,charges_max,item_state")
      .eq("character_id", characterId)
      .order("sort_order"),
    context.client
      .from("character_spells")
      .select("id,name,spell_level,school,casting_time,spell_range,duration,components,concentration,ritual,prepared,cast_mode,slot_level,description,source,catalog_spell_id,wizard_spell_mastery,wizard_signature_spell")
      .eq("character_id", characterId)
      .order("spell_level")
      .order("sort_order"),
    context.client
      .from("character_features")
      .select("id,kind,name,description,mechanics,sort_order")
      .eq("character_id", characterId)
      .order("sort_order"),
    context.client
      .from("character_resource_states")
      .select("state_key,current,max_snapshot,label,recharge,temporary_max_bonus")
      .eq("character_id", characterId)
      .order("state_key"),
    context.client
      .from("character_template_assignments")
      .select("id,template_id,template_level,selected_choices,assigned_at,updated_at")
      .eq("character_id", characterId),
    context.client
      .from("character_world_state")
      .select("location_id,campaign_day,day_period,updated_at")
      .eq("campaign_id", context.campaignId)
      .eq("character_id", characterId)
      .maybeSingle(),
  ])

  const firstError =
    sheetResult.error ||
    inventoryResult.error ||
    spellsResult.error ||
    featuresResult.error ||
    resourceResult.error ||
    assignmentResult.error ||
    worldStateResult.error
  if (firstError) return { error: firstError.message }

  const assignments = assignmentResult.data || []
  const templateIds = assignments.map((row) => row.template_id)
  let templateRows: unknown[] = []

  if (templateIds.length) {
    const { data, error } = await context.client
      .from("rule_templates")
      .select("id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,author_description,author_comment,rules_meta,is_active")
      .eq("campaign_id", context.campaignId)
      .in("id", templateIds)

    if (error) return { error: error.message }
    templateRows = data || []
  }

  let location: unknown = null
  if (worldStateResult.data?.location_id) {
    const { data } = await context.client
      .from("locations")
      .select("id,name,summary")
      .eq("campaign_id", context.campaignId)
      .eq("id", worldStateResult.data.location_id)
      .maybeSingle()
    location = data || null
  }

  return {
    character,
    sheet: sheetResult.data || null,
    resources: resourceResult.data || [],
    inventory: inventoryResult.data || [],
    spells: spellsResult.data || [],
    features: featuresResult.data || [],
    assignments,
    templates: templateRows,
    worldState: worldStateResult.data
      ? {
          ...worldStateResult.data,
          location,
        }
      : null,
  }
}

async function readLocation(
  context: VossReadToolContext,
  args: JsonObject,
) {
  const locationId = typeof args.location_id === "string" ? args.location_id : ""
  if (!locationId) return { error: "location_id is required" }

  const { data: location, error: locationError } = await context.client
    .from("locations")
    .select("id,campaign_id,parent_location_id,name,summary,description,sort_order,visibility_mode,lifecycle_state,updated_at")
    .eq("campaign_id", context.campaignId)
    .eq("id", locationId)
    .maybeSingle()

  if (locationError) return { error: locationError.message }
  if (!location) return { not_found: true }

  const [sectionsResult, childrenResult, parentResult] = await Promise.all([
    context.client
      .from("location_sections")
      .select("id,location_id,title,body,sort_order")
      .eq("location_id", locationId)
      .order("sort_order"),
    context.client
      .from("locations")
      .select("id,name,summary,visibility_mode,lifecycle_state")
      .eq("campaign_id", context.campaignId)
      .eq("parent_location_id", locationId)
      .order("sort_order")
      .order("name"),
    location.parent_location_id
      ? context.client
          .from("locations")
          .select("id,name,summary")
          .eq("campaign_id", context.campaignId)
          .eq("id", location.parent_location_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const firstError =
    sectionsResult.error ||
    childrenResult.error ||
    parentResult.error
  if (firstError) return { error: firstError.message }

  const sections = sectionsResult.data || []
  const sectionIds = sections.map((section) => section.id)
  let links: Array<Record<string, unknown>> = []

  if (sectionIds.length) {
    const { data, error } = await context.client
      .from("location_links")
      .select("id,section_id,target_location_id,label,sort_order,visibility_mode")
      .in("section_id", sectionIds)
      .order("sort_order")

    if (error) return { error: error.message }
    links = (data || []) as Array<Record<string, unknown>>
  }

  const targetIds = [...new Set(
    links
      .map((link) => link.target_location_id)
      .filter((value): value is string => typeof value === "string"),
  )]
  let targets: unknown[] = []

  if (targetIds.length) {
    const { data, error } = await context.client
      .from("locations")
      .select("id,name,summary")
      .eq("campaign_id", context.campaignId)
      .in("id", targetIds)

    if (error) return { error: error.message }
    targets = data || []
  }

  const targetById = new Map(
    (targets as Array<Record<string, unknown>>).map((target) => [target.id, target]),
  )

  return {
    location,
    parent: parentResult.data || null,
    children: childrenResult.data || [],
    sections,
    transitions: links.map((link) => ({
      ...link,
      target: targetById.get(link.target_location_id) || null,
    })),
  }
}

async function readRuleTemplate(
  context: VossReadToolContext,
  args: JsonObject,
) {
  const templateId = typeof args.template_id === "string" ? args.template_id : ""
  if (!templateId) return { error: "template_id is required" }

  const { data: template, error } = await context.client
    .from("rule_templates")
    .select("id,campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,author_description,author_comment,rules_meta,is_active,updated_at")
    .eq("campaign_id", context.campaignId)
    .eq("id", templateId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!template) return { not_found: true }

  const [parentResult, childrenResult] = await Promise.all([
    template.parent_template_id
      ? context.client
          .from("rule_templates")
          .select("id,kind,slug,name,description,unlock_level,mechanical_summary,is_active")
          .eq("campaign_id", context.campaignId)
          .eq("id", template.parent_template_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    context.client
      .from("rule_templates")
      .select("id,kind,slug,name,description,unlock_level,mechanical_summary,is_active")
      .eq("campaign_id", context.campaignId)
      .eq("parent_template_id", templateId)
      .order("unlock_level")
      .order("name"),
  ])

  const firstError = parentResult.error || childrenResult.error
  if (firstError) return { error: firstError.message }

  return {
    template,
    parent: parentResult.data || null,
    children: childrenResult.data || [],
  }
}

async function readReferenceDefinition(
  context: VossReadToolContext,
  args: JsonObject,
) {
  const definitionId =
    typeof args.definition_id === "string" ? args.definition_id : ""
  if (!definitionId) return { error: "definition_id is required" }

  const { data: definition, error } = await context.client
    .from("reference_definitions")
    .select("id,kind,scope,campaign_id,slug,visibility,status,source_kind,source_label,external_id,current_revision,created_at,updated_at")
    .eq("id", definitionId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!definition) return { not_found: true }

  if (
    definition.scope === "campaign" &&
    definition.campaign_id !== context.campaignId
  ) {
    return { not_found: true }
  }

  const { data: revision, error: revisionError } = await context.client
    .from("reference_definition_revisions")
    .select("definition_id,revision,name,summary,rules_text,mechanics,data,created_at")
    .eq("definition_id", definitionId)
    .eq("revision", definition.current_revision)
    .maybeSingle()

  if (revisionError) return { error: revisionError.message }

  return {
    definition,
    revision: revision || null,
  }
}

async function readWorkspaceFile(
  context: VossReadToolContext,
  args: JsonObject,
) {
  if (!context.canManage) return { not_found: true }

  const fileId = typeof args.file_id === "string" ? args.file_id : ""
  if (!fileId) return { error: "file_id is required" }

  const { data, error } = await context.client
    .from("gm_workspace_files")
    .select("id,campaign_id,workspace_user_id,folder_id,kind,title,body,original_name,mime_type,created_at,updated_at")
    .eq("campaign_id", context.campaignId)
    .eq("workspace_user_id", context.userId)
    .eq("id", fileId)
    .maybeSingle()

  if (error) return { error: error.message }
  return data || { not_found: true }
}

export async function executeVossReadTool(
  context: VossReadToolContext,
  name: string,
  args: JsonObject,
) {
  if (name === "search_entities") return searchEntities(context, args)
  if (name === "read_character") return readCharacter(context, args)
  if (name === "read_location") return readLocation(context, args)
  if (name === "read_rule_template") return readRuleTemplate(context, args)
  if (name === "read_reference_definition") {
    return readReferenceDefinition(context, args)
  }
  if (name === "read_workspace_file") return readWorkspaceFile(context, args)
  return { error: "Unknown read tool" }
}
