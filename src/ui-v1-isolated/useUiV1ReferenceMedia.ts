import { useCallback, useEffect, useState } from "react"

import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import { uploadCampaignImage } from "../lib/mediaUpload"
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
  url: string | null
  presentation: MediaPresentation | null
}

type ReferenceMediaRow = {
  target_field: string
  asset_id: string
  storage_path: string
  presentation: unknown
}

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

export function useUiV1ReferenceMedia() {
  const scope = useUiV1CampaignScope()
  const [items, setItems] = useState<Record<string, UiV1ReferenceMedia>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!scope.campaignId) return

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

    const next: Record<string, UiV1ReferenceMedia> = {}
    await Promise.all(
      ((data || []) as ReferenceMediaRow[]).map(async (row) => {
        if (!validReferenceSlot(row.target_field)) return
        const resolvedUrl = await resolveCampaignMediaUrl(row.storage_path)
        next[row.target_field] = {
          targetField: row.target_field,
          assetId: row.asset_id,
          storagePath: row.storage_path,
          url: resolvedUrl || row.storage_path,
          presentation: parseMediaPresentation(row.presentation),
        }
      }),
    )

    setItems(next)
    setError(null)
    setLoading(false)
  }, [scope.campaignId])

  useEffect(() => {
    if (!scope.campaignId) {
      if (!scope.loading) setLoading(false)
      return
    }
    void load()
  }, [load, scope.campaignId, scope.loading])

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
