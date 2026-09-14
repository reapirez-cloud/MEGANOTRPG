import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

import {
  imageProfileForPurpose,
  normalizeImagePurpose,
  type ImagePurpose,
} from "./image-profiles.ts"
import {
  ImageProviderError,
  requestImageBatch,
  type GeneratedImagePayload,
  type ImageReference,
} from "./image-provider.ts"

type JsonRecord = Record<string, unknown>

type ImageToolContext = {
  userClient: SupabaseClient
  admin: SupabaseClient
  campaignId: string
  userId: string
  threadId: string
  viewContext: JsonRecord
}

type ImageWorkerContext = {
  admin: SupabaseClient
  jobId: string
}

type TargetRef = {
  type: string
  id: string | null
  field: string
}

type StoredOutput = {
  assetId: string
  variantIndex: number
  b64Json: string
  revisedPrompt: string | null
}

const IMAGE_TOOL_NAMES = new Set([
  "generate_image",
  "list_recent_image_jobs",
  "save_generated_image",
  "attach_generated_image",
  "mark_generated_image_garbage",
  "purge_generated_image_garbage",
  "cancel_image_job",
])

export const VOSS_IMAGE_TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Generate 1-2 image variants through the queued image system. If the user asks for alternatives, use 2. Review may rank outputs but never removes requested variants from the user-visible result.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: {
            type: "string",
            description:
              "Complete visual prompt. Preserve campaign facts from context and do not invent lore that contradicts supplied material.",
          },
          purpose: {
            type: "string",
            enum: ["icon", "ui_preview", "portrait", "panel", "hero_art", "master_art"],
            description:
              "Semantic purpose. Use icon for inventory/item visuals and interface icons: it maps to low quality (50K). Every other purpose maps to high quality (150K). Never request raw quality settings.",
          },
          variants: {
            type: "integer",
            enum: [1, 2],
            description:
              "Exact number of final alternatives requested by the user. This provider integration supports at most 2 final variants per job.",
          },
          target: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: {
                type: "string",
                enum: ["character", "location", "reference_definition", "campaign_gallery"],
              },
              id: { type: "string" },
              field: { type: "string" },
            },
          },
          reference_asset_ids: {
            type: "array",
            maxItems: 4,
            items: { type: "string" },
            description:
              "Previously generated/visible media asset ids to use as image references.",
          },
          attach_when_ready: {
            type: "boolean",
            description:
              "Use only when the user explicitly asked to apply/attach the generated image, and only with variants=1. Never infer this from a plain generation request.",
          },
        },
        required: ["prompt", "variants"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_image_jobs",
      description:
        "Read the current user's recent image jobs and every generated output. Use this before resolving references like 'the second one' or 'that last portrait'.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_generated_image",
      description:
        "Keep one generated image permanently in MEGANOT without attaching it to a specific entity. Unsaved generated images expire after three days. Use this when the user explicitly says to save/keep a generated variant.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          asset_id: { type: "string" },
          job_id: { type: "string" },
          variant_index: { type: "integer", minimum: 1, maximum: 2 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "attach_generated_image",
      description:
        "Attach one generated asset to an allowed target after an explicit user request. Generation and attachment are separate permission checks.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          asset_id: { type: "string" },
          job_id: { type: "string" },
          variant_index: { type: "integer", minimum: 1, maximum: 2 },
          target_type: {
            type: "string",
            enum: ["character", "location", "reference_definition", "campaign_gallery"],
          },
          target_id: { type: "string" },
          target_field: { type: "string" },
          title: { type: "string" },
          caption: { type: "string" },
        },
        required: ["target_type", "target_field"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_generated_image_garbage",
      description:
        "Mark unbound generated images as garbage. Marking does not immediately destroy the file; purge is allowed only after three days.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          asset_ids: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: { type: "string" },
          },
        },
        required: ["asset_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "purge_generated_image_garbage",
      description:
        "Permanently delete the current user's generated images that have been marked garbage for at least three days.",
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
      name: "cancel_image_job",
      description:
        "Cancel the current user's queued image job or request cancellation of a running image job.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          job_id: { type: "string" },
        },
        required: ["job_id"],
      },
    },
  },
]

export function isVossImageTool(name: string) {
  return IMAGE_TOOL_NAMES.has(name)
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function stringValue(value: unknown, maxLength = 1000) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : ""
}

function uuidLike(value: unknown) {
  const text = stringValue(value, 80)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(text)
    ? text
    : ""
}

function intBetween(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value)
  return Number.isInteger(number) && number >= min && number <= max
    ? number
    : fallback
}

function currentEntity(viewContext: JsonRecord) {
  const entity = record(viewContext.entity)
  const type = stringValue(entity.type, 80)
  const id = uuidLike(entity.id)
  return type && id ? { type, id } : null
}

function normalizeTarget(args: JsonRecord, viewContext: JsonRecord): TargetRef | null {
  const raw = record(args.target)
  const directType = stringValue(raw.type, 80)
  const directId = uuidLike(raw.id)
  const field = stringValue(raw.field, 80)
  const entity = currentEntity(viewContext)

  const type = directType || entity?.type || ""
  const id = directId || entity?.id || null
  if (!type || !field) return null

  return { type, id, field }
}

function attachTargetFromArgs(args: JsonRecord, viewContext: JsonRecord): TargetRef | null {
  const entity = currentEntity(viewContext)
  const type = stringValue(args.target_type, 80) || entity?.type || ""
  const id = uuidLike(args.target_id) || entity?.id || null
  const field = stringValue(args.target_field, 80)

  if (!type || !field) return null
  return { type, id, field }
}

function referenceIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => uuidLike(item)).filter(Boolean))].slice(0, 4)
}

function runBackground(promise: Promise<unknown>) {
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void }
  }).EdgeRuntime

  if (runtime?.waitUntil) {
    runtime.waitUntil(promise)
    return
  }

  void promise
}

async function visibleReferenceIds(
  ctx: ImageToolContext,
  ids: string[],
) {
  if (!ids.length) return []

  const { data, error } = await ctx.userClient
    .from("media_assets")
    .select("id")
    .in("id", ids)

  if (error) throw new Error(error.message)
  const visible = new Set((data || []).map((row: any) => String(row.id)))
  return ids.filter((id) => visible.has(id))
}

function exactVariants(args: JsonRecord) {
  return intBetween(args.variants, 1, 2, 1)
}

async function reserveImageJob(
  ctx: ImageToolContext,
  args: JsonRecord,
) {
  const prompt = stringValue(args.prompt, 6000)
  if (!prompt) return { error: "image_prompt_required" }

  const variants = exactVariants(args)
  const target = normalizeTarget(args, ctx.viewContext)
  const refs = await visibleReferenceIds(
    ctx,
    referenceIds(args.reference_asset_ids),
  )
  const purpose = normalizeImagePurpose(args.purpose, target?.field || "")
  const profile = imageProfileForPurpose(purpose, refs.length > 0)

  const attachWhenReady =
    args.attach_when_ready === true &&
    variants === 1 &&
    Boolean(target)

  const input = {
    prompt,
    purpose,
    profile,
    variants,
    target,
    reference_asset_ids: refs,
    attach_when_ready: attachWhenReady,
    presentation_rule: "show_all_requested_outputs",
  }

  const { data: jobId, error } = await ctx.admin.rpc(
    "reserve_agent_image_job_v1",
    {
      p_campaign_id: ctx.campaignId,
      p_user_id: ctx.userId,
      p_thread_id: ctx.threadId,
      p_input: input,
      p_requested_outputs: variants,
    },
  )

  if (error || typeof jobId !== "string") {
    const message = error?.message || "image_job_reservation_failed"
    if (/player_image_quota_exceeded/i.test(message)) {
      return {
        error: "player_image_quota_exceeded",
        limit: 10,
        requested_outputs: variants,
      }
    }
    return { error: message }
  }

  runBackground(processAgentImageJob({
    admin: ctx.admin,
    jobId,
  }))

  return {
    job_id: jobId,
    status: "queued",
    requested_outputs: variants,
    purpose,
    profile: profile.key,
    model: profile.model,
    attach_when_ready: attachWhenReady,
    presentation_rule: "show_all_requested_outputs",
    instruction:
      variants === 2
        ? "The user requested alternatives. Present both final outputs; review ranking is advisory only."
        : "Present the final output from this job.",
  }
}

async function recentJobs(ctx: ImageToolContext, args: JsonRecord) {
  const limit = intBetween(args.limit, 1, 10, 5)
  const { data: jobs, error } = await ctx.userClient
    .from("agent_jobs")
    .select("id,status,input,result,requested_outputs,completed_outputs,error_code,error_message,created_at,updated_at")
    .eq("campaign_id", ctx.campaignId)
    .eq("job_type", "image_generate")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return { error: error.message }

  const ids = (jobs || []).map((job: any) => String(job.id))
  const { data: assets, error: assetError } = ids.length
    ? await ctx.userClient
      .from("media_assets")
      .select("id,source_job_id,variant_index,status,purpose,profile,review,created_at")
      .in("source_job_id", ids)
      .order("variant_index", { ascending: true })
    : { data: [], error: null }

  if (assetError) return { error: assetError.message }

  return {
    jobs: (jobs || []).map((job: any) => ({
      ...job,
      outputs: (assets || [])
        .filter((asset: any) => asset.source_job_id === job.id)
        .map((asset: any) => ({
          asset_id: asset.id,
          variant_index: asset.variant_index,
          status: asset.status,
          purpose: asset.purpose,
          profile: asset.profile,
          review: asset.review,
        })),
    })),
  }
}

async function resolveAssetId(ctx: ImageToolContext, args: JsonRecord) {
  const direct = uuidLike(args.asset_id)
  if (direct) return direct

  const jobId = uuidLike(args.job_id)
  const variantIndex = intBetween(args.variant_index, 1, 3, 0)
  if (!jobId || !variantIndex) return ""

  const { data } = await ctx.userClient
    .from("media_assets")
    .select("id")
    .eq("source_job_id", jobId)
    .eq("variant_index", variantIndex)
    .maybeSingle()

  return data?.id ? String(data.id) : ""
}

async function saveGenerated(ctx: ImageToolContext, args: JsonRecord) {
  const assetId = await resolveAssetId(ctx, args)
  if (!assetId) return { error: "generated_media_asset_required" }

  const { data: asset, error: readError } = await ctx.admin
    .from("media_assets")
    .select("id,status,review,garbage_marked_at,saved_at,expires_at")
    .eq("id", assetId)
    .eq("created_by", ctx.userId)
    .maybeSingle()

  if (readError) return { error: readError.message }
  if (!asset) return { error: "media_asset_not_found" }

  if (
    asset.status === "garbage" &&
    asset.garbage_marked_at &&
    new Date(asset.garbage_marked_at).getTime() <= Date.now() - 3 * 24 * 60 * 60 * 1000
  ) {
    return { error: "media_asset_expired" }
  }

  const review = record(asset.review)
  const restoredStatus =
    asset.status === "garbage"
      ? review.status === "completed" ? "reviewed" : "generated"
      : asset.status

  const savedAt = asset.saved_at || new Date().toISOString()
  const { error: saveError } = await ctx.admin
    .from("media_assets")
    .update({
      status: restoredStatus,
      saved_at: savedAt,
      expires_at: null,
      garbage_marked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId)
    .eq("created_by", ctx.userId)

  if (saveError) return { error: saveError.message }

  return {
    asset_id: assetId,
    saved: true,
    saved_at: savedAt,
    expires_at: null,
  }
}

async function attachGenerated(ctx: ImageToolContext, args: JsonRecord) {
  const assetId = await resolveAssetId(ctx, args)
  if (!assetId) return { error: "generated_media_asset_required" }

  const target = attachTargetFromArgs(args, ctx.viewContext)
  if (!target) return { error: "generated_media_target_required" }

  const { data: attachJob, error: attachJobError } = await ctx.admin
    .from("agent_jobs")
    .insert({
      campaign_id: ctx.campaignId,
      thread_id: ctx.threadId,
      requested_by: ctx.userId,
      agent_key: "voss",
      job_type: "image_attach",
      status: "running",
      input: {
        asset_id: assetId,
        target,
      },
      requested_outputs: 1,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (attachJobError || !attachJob?.id) {
    return { error: attachJobError?.message || "image_attach_job_failed" }
  }

  const { data, error } = await ctx.admin.rpc(
    "attach_generated_media_v1",
    {
      p_asset_id: assetId,
      p_user_id: ctx.userId,
      p_target_type: target.type,
      p_target_id: target.id,
      p_target_field: target.field,
      p_title: stringValue(args.title, 160),
      p_caption: stringValue(args.caption, 1000),
    },
  )

  if (error) {
    await ctx.admin
      .from("agent_jobs")
      .update({
        status: "failed",
        error_code: "media_attach_failed",
        error_message: error.message,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", attachJob.id)

    return { error: error.message }
  }

  await ctx.admin
    .from("agent_jobs")
    .update({
      status: "completed",
      completed_outputs: 1,
      result: record(data),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attachJob.id)

  return {
    attached: true,
    attach_job_id: attachJob.id,
    ...record(data),
  }
}

async function markGarbage(ctx: ImageToolContext, args: JsonRecord) {
  const ids = Array.isArray(args.asset_ids)
    ? [...new Set(args.asset_ids.map((value) => uuidLike(value)).filter(Boolean))].slice(0, 20)
    : []

  if (!ids.length) return { error: "asset_ids_required" }

  const marked: string[] = []
  const errors: Array<{ asset_id: string; error: string }> = []

  for (const assetId of ids) {
    const { data, error } = await ctx.admin.rpc(
      "mark_generated_media_garbage_v1",
      {
        p_asset_id: assetId,
        p_user_id: ctx.userId,
      },
    )

    if (error) {
      errors.push({ asset_id: assetId, error: error.message })
    } else if (data === true) {
      marked.push(assetId)
    }
  }

  return {
    marked,
    errors,
    purge_after_days: 3,
  }
}

async function purgeGarbage(ctx: ImageToolContext) {
  const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: assets, error } = await ctx.admin
    .from("media_assets")
    .select("id,storage_bucket,storage_path")
    .eq("created_by", ctx.userId)
    .eq("status", "garbage")
    .lte("garbage_marked_at", threshold)
    .limit(50)

  if (error) return { error: error.message }
  if (!assets?.length) return { purged: [], count: 0 }

  const grouped = new Map<string, string[]>()
  for (const asset of assets as any[]) {
    const bucket = String(asset.storage_bucket || "campaign-media")
    const current = grouped.get(bucket) || []
    current.push(String(asset.storage_path))
    grouped.set(bucket, current)
  }

  for (const [bucket, paths] of grouped) {
    const { error: removeError } = await ctx.admin.storage.from(bucket).remove(paths)
    if (removeError) return { error: removeError.message }
  }

  const ids = (assets as any[]).map((asset) => String(asset.id))
  const { error: deleteError } = await ctx.admin
    .from("media_assets")
    .delete()
    .in("id", ids)

  if (deleteError) return { error: deleteError.message }
  return { purged: ids, count: ids.length }
}

async function cancelJob(ctx: ImageToolContext, args: JsonRecord) {
  const jobId = uuidLike(args.job_id)
  if (!jobId) return { error: "job_id_required" }

  const { data, error } = await ctx.admin.rpc("cancel_agent_job_v1", {
    p_job_id: jobId,
    p_user_id: ctx.userId,
  })

  if (error) return { error: error.message }
  return { job_id: jobId, status: data }
}

export async function executeVossImageTool(
  ctx: ImageToolContext,
  name: string,
  args: JsonRecord,
) {
  if (name === "generate_image") return reserveImageJob(ctx, args)
  if (name === "list_recent_image_jobs") return recentJobs(ctx, args)
  if (name === "save_generated_image") return saveGenerated(ctx, args)
  if (name === "attach_generated_image") return attachGenerated(ctx, args)
  if (name === "mark_generated_image_garbage") return markGarbage(ctx, args)
  if (name === "purge_generated_image_garbage") return purgeGarbage(ctx)
  if (name === "cancel_image_job") return cancelJob(ctx, args)
  return { error: "unknown_image_tool" }
}

function decodeBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function detectImageEncoding(bytes: Uint8Array) {
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a

  if (isPng) return { mimeType: "image/png", extension: "png" }

  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff

  if (isJpeg) return { mimeType: "image/jpeg", extension: "jpg" }

  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"

  if (isWebp) return { mimeType: "image/webp", extension: "webp" }

  throw new Error("image_provider_returned_unknown_binary_format")
}

async function loadReferences(
  admin: SupabaseClient,
  ids: string[],
): Promise<ImageReference[]> {
  if (!ids.length) return []

  const { data: assets, error } = await admin
    .from("media_assets")
    .select("id,storage_bucket,storage_path,mime_type")
    .in("id", ids)

  if (error) throw new Error(error.message)

  const references: ImageReference[] = []
  for (const asset of (assets || []) as any[]) {
    const { data: blob, error: downloadError } = await admin.storage
      .from(String(asset.storage_bucket || "campaign-media"))
      .download(String(asset.storage_path))

    if (downloadError || !blob) continue
    references.push({
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType: String(asset.mime_type || "image/png"),
      fileName:
        String(asset.id) +
        (String(asset.mime_type) === "image/jpeg"
          ? ".jpg"
          : String(asset.mime_type) === "image/webp"
            ? ".webp"
            : ".png"),
    })
  }

  return references
}

async function insertOutput(
  admin: SupabaseClient,
  job: any,
  output: GeneratedImagePayload,
  variantIndex: number,
  profile: ReturnType<typeof imageProfileForPurpose>,
): Promise<StoredOutput> {
  const assetId = crypto.randomUUID()
  const bytes = decodeBase64(output.b64Json)
  const encoding = detectImageEncoding(bytes)
  const path =
    String(job.campaign_id) + "/" +
    String(job.requested_by) + "/ai-assets/" +
    assetId + "/image." + encoding.extension

  const { error: uploadError } = await admin.storage
    .from("campaign-media")
    .upload(path, bytes, {
      upsert: false,
      contentType: encoding.mimeType,
      cacheControl: "3600",
    })

  if (uploadError) throw new Error(uploadError.message)

  const input = record(job.input)
  const { error: insertError } = await admin.from("media_assets").insert({
    id: assetId,
    campaign_id: job.campaign_id,
    created_by: job.requested_by,
    source_job_id: job.id,
    provider_key: "cheapvibecode-image",
    model_key: profile.model,
    purpose: input.purpose,
    profile: profile.key,
    status: "generated",
    storage_bucket: "campaign-media",
    storage_path: path,
    mime_type: encoding.mimeType,
    width: profile.width,
    height: profile.height,
    variant_index: variantIndex,
    prompt: stringValue(input.prompt, 6000),
    review: {
      revised_prompt: output.revisedPrompt,
    },
    expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  })

  if (insertError) {
    await admin.storage.from("campaign-media").remove([path])
    throw new Error(insertError.message)
  }

  return {
    assetId,
    variantIndex,
    b64Json: output.b64Json,
    revisedPrompt: output.revisedPrompt,
  }
}

function deepSeekKey() {
  return Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("AI_API_KEY") || ""
}

function cleanJsonText(value: string) {
  return value
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "")
    .trim()
}

async function reviewOutputs(
  admin: SupabaseClient,
  outputs: StoredOutput[],
  prompt: string,
) {
  if (!outputs.length) return { status: "skipped", reason: "no_outputs" }

  const apiKey = deepSeekKey()
  if (!apiKey) return { status: "skipped", reason: "vision_provider_not_configured" }

  const { data: rows } = await admin
    .from("ai_models")
    .select("model_key")
    .eq("provider_key", "deepseek")
    .eq("model_kind", "agent")
    .eq("access_scope", "campaign")
    .eq("supports_vision", true)
    .eq("enabled", true)
    .order("cost_tier", { ascending: true })
    .order("latency_tier", { ascending: true })
    .limit(1)

  const model = rows?.[0]?.model_key
  if (!model) return { status: "skipped", reason: "vision_model_unavailable" }

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: [
        "Review the generated alternatives against the user's prompt.",
        "Return JSON only with keys: preferred_variant, ranking, summary, notes.",
        "preferred_variant must be one variant number or null.",
        "ranking must contain every supplied variant exactly once.",
        "notes must be an object keyed by variant number.",
        "IMPORTANT: this ranking is advisory. Every requested output remains user-visible.",
        "Prompt: " + prompt,
      ].join("\n"),
    },
  ]

  for (const output of outputs) {
    content.push({
      type: "text",
      text: "VARIANT " + output.variantIndex,
    })
    content.push({
      type: "image_url",
      image_url: {
        url: "data:" + detectImageEncoding(decodeBase64(output.b64Json)).mimeType +
          ";base64," + output.b64Json,
      },
    })
  }

  const base = (
    Deno.env.get("DEEPSEEK_API_BASE_URL") ||
    Deno.env.get("AI_API_BASE_URL") ||
    "https://api.deepseek.com"
  ).replace(/\/+$/, "")

  try {
    const response = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a visual reviewer. Compare alternatives, do not suppress any output, and return compact JSON.",
          },
          { role: "user", content },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      return {
        status: "failed",
        error: "vision_review_http_" + response.status,
      }
    }

    const payload = await response.json()
    const raw = payload?.choices?.[0]?.message?.content
    if (typeof raw !== "string") {
      return { status: "failed", error: "vision_review_empty" }
    }

    let parsed: JsonRecord
    try {
      parsed = record(JSON.parse(cleanJsonText(raw)))
    } catch {
      return {
        status: "failed",
        error: "vision_review_invalid_json",
        preview: raw.slice(0, 600),
      }
    }

    const validIndexes = outputs.map((output) => output.variantIndex)
    const ranking = Array.isArray(parsed.ranking)
      ? parsed.ranking
        .map((value) => Number(value))
        .filter((value) => validIndexes.includes(value))
      : []
    const completeRanking = [
      ...new Set([...ranking, ...validIndexes]),
    ]

    const preferredCandidate = Number(parsed.preferred_variant)
    const preferredVariant = validIndexes.includes(preferredCandidate)
      ? preferredCandidate
      : null
    const notes = record(parsed.notes)
    const summary = stringValue(parsed.summary, 1200)

    return {
      status: "completed",
      reviewer_model: model,
      preferred_variant: preferredVariant,
      ranking: completeRanking,
      summary,
      notes,
      presentation_rule: "show_all_requested_outputs",
    }
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function applyReview(
  admin: SupabaseClient,
  outputs: StoredOutput[],
  review: JsonRecord,
) {
  if (review.status !== "completed") return

  const ranking = Array.isArray(review.ranking)
    ? review.ranking.map((value) => Number(value))
    : []
  const notes = record(review.notes)
  const preferred = Number(review.preferred_variant)

  for (const output of outputs) {
    const rank = ranking.indexOf(output.variantIndex)
    await admin
      .from("media_assets")
      .update({
        status: "reviewed",
        review: {
          status: "completed",
          preferred: preferred === output.variantIndex,
          rank: rank >= 0 ? rank + 1 : null,
          note: stringValue(notes[String(output.variantIndex)], 1000),
          summary: stringValue(review.summary, 1200),
          reviewer_model: review.reviewer_model,
          revised_prompt: output.revisedPrompt,
          presentation_rule: "show_all_requested_outputs",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", output.assetId)
  }
}

async function maybeAutoAttach(
  admin: SupabaseClient,
  job: any,
  outputs: StoredOutput[],
) {
  const input = record(job.input)
  if (input.attach_when_ready !== true || outputs.length !== 1) return null

  const target = record(input.target)
  const type = stringValue(target.type, 80)
  const id = uuidLike(target.id) || null
  const field = stringValue(target.field, 80)
  if (!type || !field) return null

  const { data, error } = await admin.rpc("attach_generated_media_v1", {
    p_asset_id: outputs[0].assetId,
    p_user_id: job.requested_by,
    p_target_type: type,
    p_target_id: id,
    p_target_field: field,
    p_title: "",
    p_caption: "",
  })

  if (error) {
    return {
      status: "failed",
      error: error.message,
    }
  }

  return {
    status: "attached",
    ...record(data),
  }
}

async function cleanupExpiredMedia(admin: SupabaseClient, userId: string) {
  const garbageThreshold = new Date(
    Date.now() - 3 * 24 * 60 * 60 * 1000,
  ).toISOString()
  const now = new Date().toISOString()

  const [{ data: expired }, { data: garbage }] = await Promise.all([
    admin
      .from("media_assets")
      .select("id,storage_bucket,storage_path")
      .eq("created_by", userId)
      .in("status", ["generated", "reviewed", "rejected"])
      .is("saved_at", null)
      .not("expires_at", "is", null)
      .lte("expires_at", now)
      .limit(20),
    admin
      .from("media_assets")
      .select("id,storage_bucket,storage_path")
      .eq("created_by", userId)
      .eq("status", "garbage")
      .lte("garbage_marked_at", garbageThreshold)
      .limit(20),
  ])

  const byId = new Map<string, any>()
  for (const asset of [...(expired || []), ...(garbage || [])] as any[]) {
    byId.set(String(asset.id), asset)
  }

  for (const asset of byId.values()) {
    const bucket = String(asset.storage_bucket || "campaign-media")
    const path = String(asset.storage_path)
    const { error } = await admin.storage.from(bucket).remove([path])
    if (!error) {
      await admin.from("media_assets").delete().eq("id", asset.id)
    }
  }
}

async function failJob(
  admin: SupabaseClient,
  jobId: string,
  error: unknown,
  completedOutputs = 0,
  outputs: StoredOutput[] = [],
) {
  const providerError = error instanceof ImageProviderError ? error : null
  await admin
    .from("agent_jobs")
    .update({
      status: "failed",
      completed_outputs: completedOutputs,
      error_code: providerError?.code || "image_job_failed",
      error_message:
        providerError?.detail ||
        (error instanceof Error ? error.message : String(error)),
      result: {
        outputs: outputs.map((output) => ({
          asset_id: output.assetId,
          variant_index: output.variantIndex,
        })),
        presentation_rule: "show_all_requested_outputs",
      },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
}

export async function processAgentImageJob({
  admin,
  jobId,
}: ImageWorkerContext) {
  const { data: job, error: jobError } = await admin
    .from("agent_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle()

  if (jobError || !job) return
  if (job.status === "cancelled") return

  await admin
    .from("agent_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId)
    .eq("status", "queued")

  const input = record(job.input)
  const prompt = stringValue(input.prompt, 6000)
  const purpose = normalizeImagePurpose(input.purpose)
  const refs = referenceIds(input.reference_asset_ids)
  const profile = imageProfileForPurpose(purpose, refs.length > 0)
  const requested = intBetween(job.requested_outputs, 1, 2, 1)
  const outputs: StoredOutput[] = []

  try {
    const references = await loadReferences(admin, refs)
    let attempts = 0

    while (outputs.length < requested && attempts < 3) {
      attempts += 1

      const { data: fresh } = await admin
        .from("agent_jobs")
        .select("cancel_requested,status")
        .eq("id", jobId)
        .maybeSingle()

      if (fresh?.cancel_requested || fresh?.status === "cancelled") {
        await admin
          .from("agent_jobs")
          .update({
            status: "cancelled",
            completed_outputs: outputs.length,
            result: {
              outputs: outputs.map((output) => ({
                asset_id: output.assetId,
                variant_index: output.variantIndex,
              })),
              presentation_rule: "show_all_requested_outputs",
            },
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
        return
      }

      const missing = requested - outputs.length
      const batch = await requestImageBatch({
        prompt,
        count: missing,
        profile,
        references,
      })

      if (!batch.images.length) break

      for (const generated of batch.images.slice(0, missing)) {
        const output = await insertOutput(
          admin,
          job,
          generated,
          outputs.length + 1,
          profile,
        )
        outputs.push(output)

        await admin
          .from("agent_jobs")
          .update({
            completed_outputs: outputs.length,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
      }
    }

    if (outputs.length < requested) {
      await failJob(
        admin,
        jobId,
        new Error(
          "Image provider returned only " +
          outputs.length +
          " of " +
          requested +
          " requested final outputs after retries.",
        ),
        outputs.length,
        outputs,
      )
      return
    }

    const { data: reviewJob, error: reviewJobError } = await admin
      .from("agent_jobs")
      .insert({
        campaign_id: job.campaign_id,
        thread_id: job.thread_id,
        requested_by: job.requested_by,
        agent_key: "voss",
        job_type: "image_review",
        status: "running",
        input: {
          source_job_id: job.id,
          asset_ids: outputs.map((output) => output.assetId),
        },
        requested_outputs: 1,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    const review = record(await reviewOutputs(admin, outputs, prompt))
    await applyReview(admin, outputs, review)

    if (!reviewJobError && reviewJob?.id) {
      await admin
        .from("agent_jobs")
        .update({
          status: review.status === "failed" ? "failed" : "completed",
          completed_outputs: review.status === "failed" ? 0 : 1,
          result: review,
          error_code:
            review.status === "failed" ? "image_review_failed" : null,
          error_message:
            review.status === "failed"
              ? stringValue(review.error, 1200) || "Image review failed"
              : null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", reviewJob.id)
    }

    const attachment = await maybeAutoAttach(admin, job, outputs)

    await admin
      .from("agent_jobs")
      .update({
        status: "completed",
        completed_outputs: outputs.length,
        result: {
          outputs: outputs.map((output) => ({
            asset_id: output.assetId,
            variant_index: output.variantIndex,
          })),
          profile: profile.key,
          purpose,
          model: profile.model,
          review,
          attachment,
          presentation_rule: "show_all_requested_outputs",
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)

    await cleanupExpiredMedia(admin, String(job.requested_by))
  } catch (error) {
    await failJob(admin, jobId, error, outputs.length, outputs)
  }
}
