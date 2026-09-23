import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"

import type { RouterModel } from "../voss-agent/model-router.ts"
import {
  ProviderGatewayError,
  requestChatCompletion,
} from "../voss-agent/provider-gateway.ts"

type JsonRecord = Record<string, unknown>

type BuildJob = {
  id: string
  campaign_id: string
  requested_by: string
  input: JsonRecord
}

const WORKER_MODEL_KEY = "deepseek-v4.1-flash"

const SYSTEM = [
  "Ты служебный NPC-runtime worker MEGANOT. Ты НЕ ведущий и не пишешь игрокам.",
  "Нужно выбрать ровно одну каноническую основу NPC из переданного bestiary_catalog.",
  "Оценивай роль, класс/профессию, уровень, challenge_rating, creature_type и краткое описание NPC.",
  "Не придумывай новые числа, атаки, заклинания или ресурсы. Ты выбираешь только существующий bestiary_slug из candidates.",
  "Если точного совпадения нет, выбирай ближайший разумный статблок по функции и опасности, а не по имени.",
  'Верни только JSON без markdown: {"bestiary_slug":"...","reason":"коротко"}.',
].join("\n")

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function text(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseObject(value: string): JsonRecord | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  ]
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord
      }
    } catch {
      // Try the next representation.
    }
  }
  return null
}

function providerText(payload: any) {
  const direct = payload?.choices?.[0]?.message?.content
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim()
  }
  return ""
}

async function fixedModel(admin: SupabaseClient): Promise<RouterModel> {
  const { data, error } = await admin
    .from("ai_models")
    .select("id,provider_key,model_key,display_name,enabled,is_base,gm_selectable,user_selectable,supports_tools,supports_json,supports_streaming,supports_vision,model_kind,access_scope,context_window,cost_tier,reasoning_tier,latency_tier")
    .eq("model_key", WORKER_MODEL_KEY)
    .eq("enabled", true)
    .eq("model_kind", "agent")
    .eq("access_scope", "campaign")
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("npc_runtime_worker_model_missing")
  return data as RouterModel
}

async function claimJob(
  admin: SupabaseClient,
  jobId: string,
  campaignId: string,
  npcCharacterId: string,
): Promise<BuildJob | null> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("agent_jobs")
    .update({
      status: "running",
      started_at: now,
      updated_at: now,
    })
    .eq("id", jobId)
    .eq("campaign_id", campaignId)
    .eq("agent_key", "npc-runtime-worker")
    .eq("job_type", "npc_runtime_build")
    .eq("status", "queued")
    .contains("input", {
      surface: "npc_runtime_build_v1",
      npc_character_id: npcCharacterId,
    })
    .select("id,campaign_id,requested_by,input")
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data?.id) return null

  await admin
    .from("npc_runtime_builds")
    .update({ status: "running", updated_at: now })
    .eq("character_id", npcCharacterId)
    .eq("last_job_id", jobId)

  return {
    id: data.id,
    campaign_id: data.campaign_id,
    requested_by: data.requested_by,
    input: record(data.input),
  }
}

async function failJob(
  admin: SupabaseClient,
  jobId: string,
  npcCharacterId: string,
  error: unknown,
) {
  const gateway = error instanceof ProviderGatewayError ? error : null
  const message = error instanceof Error ? error.message : String(error)
  const now = new Date().toISOString()

  await Promise.all([
    admin
      .from("agent_jobs")
      .update({
        status: "failed",
        error_code: gateway?.code || "npc_runtime_build_failed",
        error_message: message.slice(0, 500),
        completed_at: now,
        updated_at: now,
      })
      .eq("id", jobId),
    admin
      .from("npc_runtime_builds")
      .update({
        status: "failed",
        updated_at: now,
      })
      .eq("character_id", npcCharacterId)
      .eq("last_job_id", jobId),
  ])
}

function keywordScore(candidate: JsonRecord, words: string[]) {
  const haystack = [
    text(candidate.slug, 200),
    text(candidate.name_en, 200),
    text(candidate.creature_type, 100),
  ].join(" ").toLowerCase()

  return words.reduce(
    (score, word) => score + (word.length >= 3 && haystack.includes(word) ? 1 : 0),
    0,
  )
}

async function loadSnapshot(
  admin: SupabaseClient,
  campaignId: string,
  npcCharacterId: string,
) {
  const [characterResult, profileResult, sheetResult] = await Promise.all([
    admin
      .from("characters")
      .select("id,campaign_id,name,character_class,level,bio,character_type,life_state,publication_state")
      .eq("id", npcCharacterId)
      .eq("campaign_id", campaignId)
      .maybeSingle(),
    admin
      .from("npc_profiles")
      .select("character_id,role,species,creature_type,size,challenge_rating,occupation,faction,appearance,demeanor,motivation,public_notes,gm_notes,tags")
      .eq("character_id", npcCharacterId)
      .maybeSingle(),
    admin
      .from("character_sheets")
      .select("character_id,strength,dexterity,constitution,intelligence,wisdom,charisma,armor_class,max_hp,current_hp,speed,proficiency_bonus,saving_throw_proficiencies,skill_proficiencies")
      .eq("character_id", npcCharacterId)
      .maybeSingle(),
  ])

  const error = characterResult.error || profileResult.error || sheetResult.error
  if (error) throw new Error(error.message)
  if (!characterResult.data || !profileResult.data || !sheetResult.data) {
    throw new Error("npc_runtime_snapshot_missing")
  }

  if (
    characterResult.data.character_type !== "npc" ||
    characterResult.data.life_state !== "alive" ||
    characterResult.data.publication_state !== "campaign"
  ) {
    throw new Error("npc_runtime_character_not_canonical")
  }

  let query = admin
    .from("bestiary_catalog")
    .select("slug,name_en,creature_type,challenge_rating,armor_class,hit_points,proficiency_bonus,actions,special_abilities,reactions")
    .limit(120)

  const creatureType = text(profileResult.data.creature_type, 100).toLowerCase()
  if (creatureType) query = query.eq("creature_type", creatureType)

  let { data: candidates, error: candidatesError } = await query
  if (candidatesError) throw new Error(candidatesError.message)

  if (!candidates?.length) {
    const fallback = await admin
      .from("bestiary_catalog")
      .select("slug,name_en,creature_type,challenge_rating,armor_class,hit_points,proficiency_bonus,actions,special_abilities,reactions")
      .limit(160)
    if (fallback.error) throw new Error(fallback.error.message)
    candidates = fallback.data
  }

  const profile = record(profileResult.data)
  const targetCr = number(profile.challenge_rating, 0)
  const words = [
    text(profile.role, 100),
    text(profile.occupation, 100),
    text(characterResult.data.character_class, 100),
    text(profile.species, 100),
  ]
    .join(" ")
    .toLowerCase()
    .split(/[^a-zа-яё0-9_-]+/i)
    .filter(Boolean)

  const sorted = (candidates || [])
    .map((candidate) => record(candidate))
    .sort((left, right) => {
      const keywordDelta =
        keywordScore(right, words) - keywordScore(left, words)
      if (keywordDelta) return keywordDelta
      const leftCr = Math.abs(number(left.challenge_rating, 0) - targetCr)
      const rightCr = Math.abs(number(right.challenge_rating, 0) - targetCr)
      return leftCr - rightCr
    })
    .slice(0, 24)

  if (!sorted.length) throw new Error("npc_runtime_bestiary_candidates_missing")

  return {
    character: characterResult.data,
    profile: profileResult.data,
    current_sheet: sheetResult.data,
    candidates: sorted.map((candidate) => ({
      slug: candidate.slug,
      name: candidate.name_en,
      creature_type: candidate.creature_type,
      challenge_rating: candidate.challenge_rating,
      armor_class: candidate.armor_class,
      hit_points: candidate.hit_points,
      proficiency_bonus: candidate.proficiency_bonus,
      action_names: Array.isArray(candidate.actions)
        ? candidate.actions.map((item) => text(record(item).name, 120)).filter(Boolean)
        : [],
      special_names: Array.isArray(candidate.special_abilities)
        ? candidate.special_abilities.map((item) => text(record(item).name, 120)).filter(Boolean)
        : [],
    })),
  }
}

async function selectBestiarySlug(
  admin: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
) {
  const model = await fixedModel(admin)
  const payload = await requestChatCompletion({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify(snapshot),
      },
    ],
    temperature: 0.1,
    timeoutMs: 75_000,
    retryCount: 1,
  })

  const raw = providerText(payload)
  const parsed = raw ? parseObject(raw) : null
  const requestedSlug = text(parsed?.bestiary_slug, 180).toLowerCase()
  const allowed = new Set(
    snapshot.candidates.map((candidate) => String(candidate.slug).toLowerCase()),
  )
  const selected =
    requestedSlug && allowed.has(requestedSlug)
      ? requestedSlug
      : String(snapshot.candidates[0]?.slug || "").toLowerCase()

  if (!selected) throw new Error("npc_runtime_worker_no_selection")
  return { model, selected }
}

async function run(
  admin: SupabaseClient,
  job: BuildJob,
  npcCharacterId: string,
) {
  const snapshot = await loadSnapshot(admin, job.campaign_id, npcCharacterId)
  const { model, selected } = await selectBestiarySlug(admin, snapshot)

  const expectedSignature = text(job.input.build_signature, 128)
  if (!expectedSignature) throw new Error("npc_runtime_build_signature_missing")

  const applied = await admin.rpc("apply_ai_gm_npc_runtime_build_v2", {
    p_job_id: job.id,
    p_bestiary_slug: selected,
    p_model_id: model.id,
    p_expected_signature: expectedSignature,
  })
  if (applied.error) throw new Error(applied.error.message)

  return applied.data
}

function reply(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceRoleKey) {
    return reply({ error: "service_role_not_configured" }, 503)
  }

  let body: JsonRecord
  try {
    const parsed = await req.json()
    body = record(parsed)
  } catch {
    return reply({ error: "invalid_json" }, 400)
  }

  const jobId = text(body.jobId, 100)
  const campaignId = text(body.campaignId, 100)
  const npcCharacterId = text(body.npcCharacterId, 100)
  const dispatchToken = text(body.dispatchToken, 200)
  if (!jobId || !campaignId || !npcCharacterId || !dispatchToken) {
    return reply({ error: "dispatch_payload_invalid" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const verification = await admin.rpc(
    "verify_ai_gm_npc_runtime_dispatch_v1",
    { p_token: dispatchToken },
  )
  if (verification.error || verification.data !== true) {
    return reply({ error: "dispatch_denied" }, 403)
  }

  const job = await claimJob(admin, jobId, campaignId, npcCharacterId)
  if (!job) {
    const existing = await admin
      .from("agent_jobs")
      .select("status,result,error_code,error_message")
      .eq("id", jobId)
      .maybeSingle()

    if (existing.error) return reply({ error: existing.error.message }, 500)
    return reply({
      ok: existing.data?.status === "completed",
      status: existing.data?.status || "not_claimed",
      result: record(existing.data?.result),
    })
  }

  try {
    const result = await run(admin, job, npcCharacterId)
    return reply({ ok: true, result: record(result) })
  } catch (error) {
    await failJob(admin, job.id, npcCharacterId, error)
    return reply({
      error: error instanceof Error ? error.message : String(error),
      code: "npc_runtime_build_failed",
    }, 500)
  }
})
