import { useCallback, useEffect, useState } from "react"

import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import {
  uploadCampaignImage,
  uploadCampaignUiIconDerivative,
} from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import {
  parseMediaPresentation,
  type MediaPresentation,
} from "../media/presentation"
import type { SnakeActionInput } from "../snake-engine"
import { useUiV1CampaignScope } from "./useUiV1SectionData"

export type ReferenceArtKind =
  | "preview"
  | "hero"
  | "sheet_background"
  | "portrait_frame"
  | "resource"
  | "spell_slot"

export type UiV1ReferenceMedia = {
  targetField: string
  assetId: string
  storagePath: string
  uiStoragePath: string | null
  url: string | null
  presentation: MediaPresentation | null
}

type ReferenceMediaRow = {
  target_field: string
  asset_id: string
  storage_path: string
  ui_storage_path: string | null
  ui_mime_type: string | null
  ui_width: number | null
  ui_height: number | null
  presentation: unknown
}

const uiDerivativeBackfillInFlight = new Set<string>()

type MutationResult = { ok: boolean; error?: string }

export function classReferenceArtSlot(
  classId: string,
  kind: ReferenceArtKind,
) {
  return `class:${classId}:${kind}`
}

export function subclassReferenceArtSlot(
  classId: string,
  subclassId: string,
  kind: ReferenceArtKind,
) {
  return `subclass:${classId}:${subclassId}:${kind}`
}

export function resourceReferenceArtSlot(stateKey: string) {
  return `resource:${stateKey}`
}

function validReferenceSlot(value: string) {
  return /^(?:class:[a-z0-9-]+:(?:preview|hero|sheet_background|portrait_frame|resource|spell_slot)|subclass:[a-z0-9-]+:[a-z0-9-]+:(?:preview|hero)|resource:[a-z0-9_-]+)$/.test(value)
}

function iconReferenceSlot(value: string) {
  return value.startsWith("resource:") ||
    value.endsWith(":resource") ||
    value.endsWith(":spell_slot")
}

function relevantReferenceSlot(value: string, classKey: string | null) {
  if (!classKey) return true
  if (value.startsWith("class:")) {
    return value.startsWith(`class:${classKey}:`)
  }
  if (value.startsWith("subclass:")) return false
  return true
}

function classIconReferenceSlot(value: string, classKey: string | null) {
  if (!classKey) return false
  return value.startsWith(`class:${classKey}:`) && iconReferenceSlot(value)
}

async function backfillUiDerivative(
  row: ReferenceMediaRow,
  campaignId: string,
) {
  if (uiDerivativeBackfillInFlight.has(row.asset_id)) return false
  uiDerivativeBackfillInFlight.add(row.asset_id)

  try {
    const sourceUrl = await resolveCampaignMediaUrl(row.storage_path)
    if (!sourceUrl) return false

    const response = await fetch(sourceUrl)
    if (!response.ok) return false
    const source = await response.blob()

    const derivative = await uploadCampaignUiIconDerivative(
      source,
      "reference-icons-ui",
      campaignId,
    )
    if (!derivative.ok) return false

    const { error } = await supabase.rpc("set_media_ui_derivative_v1", {
      p_asset_id: row.asset_id,
      p_storage_path: derivative.url,
      p_mime_type: derivative.mimeType,
      p_width: derivative.width,
      p_height: derivative.height,
    })

    return !error
  } catch {
    return false
  } finally {
    uiDerivativeBackfillInFlight.delete(row.asset_id)
  }
}

export function useUiV1ReferenceMedia(
  enabled = true,
  classKeyInput?: string | null,
) {
  const classKey = classKeyInput?.trim() || null
  const scope = useUiV1CampaignScope()
  const [items, setItems] = useState<Record<string, UiV1ReferenceMedia>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled || !scope.campaignId) return

    setLoading(true)
    const { data, error: queryError } = await supabase.rpc(
      "list_reference_media_v1",
      { p_campaign_id: scope.campaignId },
    )

    if (queryError) {
      setItems({})
      setError(queryError.message)
      setLoading(false)
      return
    }

    const rows = (data || []) as ReferenceMediaRow[]
    const next: Record<string, UiV1ReferenceMedia> = {}
    const missingClassIconDerivatives: ReferenceMediaRow[] = []

    await Promise.all(
      rows.map(async (row) => {
        if (!validReferenceSlot(row.target_field)) return
        if (!relevantReferenceSlot(row.target_field, classKey)) return

        const isIcon = iconReferenceSlot(row.target_field)
        const displayPath = isIcon
          ? row.ui_storage_path
          : row.storage_path
        const resolvedUrl = displayPath
          ? await resolveCampaignMediaUrl(displayPath)
          : null

        if (
          isIcon &&
          !row.ui_storage_path &&
          scope.isOwner &&
          classIconReferenceSlot(row.target_field, classKey)
        ) {
          missingClassIconDerivatives.push(row)
        }

        next[row.target_field] = {
          targetField: row.target_field,
          assetId: row.asset_id,
          storagePath: row.storage_path,
          uiStoragePath: row.ui_storage_path,
          url: resolvedUrl,
          presentation: parseMediaPresentation(row.presentation),
        }
      }),
    )

    setItems(next)
    setError(null)
    setLoading(false)

    if (missingClassIconDerivatives.length > 0 && scope.isOwner) {
      window.setTimeout(() => {
        void (async () => {
          let changed = false
          for (const row of missingClassIconDerivatives.slice(0, 2)) {
            changed = (await backfillUiDerivative(
              row,
              scope.campaignId as string,
            )) || changed
          }
          if (changed) void load()
        })()
      }, 1800)
    }
  }, [classKey, enabled, scope.campaignId, scope.isOwner])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    if (!scope.campaignId) {
      if (!scope.loading) setLoading(false)
      return
    }
    void load()
  }, [enabled, load, scope.campaignId, scope.loading])

  const get = useCallback(
    (targetField: string) => items[targetField] || null,
    [items],
  )

  const apply = useCallback(async (
    targetField: string,
    input: SnakeActionInput,
  ): Promise<MutationResult> => {
    if (!scope.isOwner || !scope.campaignId) {
      return { ok: false, error: "Только администратор может менять арты справочника." }
    }

    if (!validReferenceSlot(targetField)) {
      return { ok: false, error: "Неизвестный графический слот." }
    }

    const presentation = parseMediaPresentation(input?.presentation)
    if (!presentation) {
      return { ok: false, error: "Кадр изображения не определён." }
    }

    const current = items[targetField] || null
    const facts =
      input?.itemFacts &&
      typeof input.itemFacts === "object" &&
      !Array.isArray(input.itemFacts)
        ? input.itemFacts as Record<string, unknown>
        : {}

    let assetId =
      typeof facts.assetId === "string"
        ? facts.assetId
        : current?.assetId || ""
    let storagePath =
      typeof facts.storagePath === "string"
        ? facts.storagePath
        : current?.storagePath || ""
    const file =
      typeof File !== "undefined" && input?.file instanceof File
        ? input.file
        : null

    setBusy(true)
    setError(null)

    try {
      if (file) {
        const isIcon = iconReferenceSlot(targetField)
        const isPortraitFrame = targetField.endsWith(":portrait_frame")
        const upload = await uploadCampaignImage(
          file,
          isIcon ? "reference-icons" : "reference-art",
          scope.campaignId,
          {
            preservePng: isIcon || isPortraitFrame,
            preserveOriginal: isIcon || isPortraitFrame,
          },
        )
        if (!upload.ok) {
          setBusy(false)
          return { ok: false, error: upload.error }
        }

        storagePath = upload.url
        const isHero = targetField.endsWith(":hero")
        const isSheetBackground = targetField.endsWith(":sheet_background")
        const { data: registered, error: registerError } = await supabase.rpc(
          "register_manual_media_v1",
          {
            p_campaign_id: scope.campaignId,
            p_storage_path: storagePath,
            p_mime_type: upload.mimeType,
            p_width: upload.width,
            p_height: upload.height,
            p_purpose: isIcon
              ? "icon"
              : isHero
                ? "hero_art"
                : isSheetBackground
                  ? "panel"
                  : isPortraitFrame
                    ? "portrait"
                    : "ui_preview",
            p_profile: isIcon
              ? "tiny_icon"
              : isHero
                ? "hero_art"
                : isSheetBackground
                  ? "panel"
                  : isPortraitFrame
                    ? "portrait"
                    : "ui_preview",
          },
        )

        if (registerError || !registered) {
          const message =
            registerError?.message || "Не удалось зарегистрировать изображение."
          setError(message)
          setBusy(false)
          return { ok: false, error: message }
        }

        assetId = String(registered)

        if (isIcon) {
          const derivative = await uploadCampaignUiIconDerivative(
            file,
            "reference-icons-ui",
            scope.campaignId,
          )
          if (derivative.ok) {
            await supabase.rpc("set_media_ui_derivative_v1", {
              p_asset_id: assetId,
              p_storage_path: derivative.url,
              p_mime_type: derivative.mimeType,
              p_width: derivative.width,
              p_height: derivative.height,
            })
          }
        }
      }

      if (!assetId || !storagePath) {
        const message =
          "Встроенный арт можно только заменить загрузкой нового файла."
        setError(message)
        setBusy(false)
        return { ok: false, error: message }
      }

      const { error: bindError } = await supabase.rpc(
        "bind_media_presentation_v1",
        {
          p_asset_id: assetId,
          p_target_type: "reference_art",
          p_target_id: scope.campaignId,
          p_target_field: targetField,
          p_presentation: presentation,
        },
      )

      if (bindError) {
        setError(bindError.message)
        setBusy(false)
        return { ok: false, error: bindError.message }
      }

      await load()
      setBusy(false)
      return { ok: true }
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Не удалось применить арт."
      setError(message)
      setBusy(false)
      return { ok: false, error: message }
    }
  }, [items, load, scope.campaignId, scope.isOwner])

  const reset = useCallback(async (
    targetField: string,
  ): Promise<MutationResult> => {
    if (!scope.isOwner || !scope.campaignId) {
      return {
        ok: false,
        error: "Только администратор может сбрасывать графику листа.",
      }
    }

    if (!validReferenceSlot(targetField)) {
      return { ok: false, error: "Неизвестный графический слот." }
    }

    setBusy(true)
    setError(null)

    try {
      const { error: resetError } = await supabase.rpc(
        "unbind_media_presentation_v1",
        {
          p_campaign_id: scope.campaignId,
          p_target_type: "reference_art",
          p_target_id: scope.campaignId,
          p_target_field: targetField,
        },
      )

      if (resetError) {
        setError(resetError.message)
        setBusy(false)
        return { ok: false, error: resetError.message }
      }

      await load()
      setBusy(false)
      return { ok: true }
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Не удалось сбросить графику."
      setError(message)
      setBusy(false)
      return { ok: false, error: message }
    }
  }, [load, scope.campaignId, scope.isOwner])

  return {
    ...scope,
    items,
    loading: scope.loading || loading,
    busy,
    error: scope.error || error,
    get,
    apply,
    reset,
    refresh: load,
  }
}
