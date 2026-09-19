import { useCallback, useEffect, useMemo, useState } from "react"

import { deleteCampaignMediaObjects, uploadCampaignImage } from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import { useUiV1CampaignScope } from "./useUiV1SectionData"

export type ArtCollection =
  | "comics"
  | "world"
  | "npc"
  | "location"
  | "player"
  | "system"

export type UiV1ArtItem = {
  id: string
  asset_id: string | null
  uploaded_by: string | null
  character_id: string | null
  location_id: string | null
  title: string
  caption: string
  image_url: string
  kind: "art" | "comic" | "map" | "sketch"
  collection: ArtCollection
  created_at: string
}

export type UiV1ArtPage = {
  id: string
  art_item_id: string
  page_number: number
  image_url: string
}

export type UiV1GeneratedAsset = {
  id: string
  source_job_id: string | null
  purpose: string
  profile: string
  status: string
  storage_bucket: string
  storage_path: string
  width: number
  height: number
  variant_index: number
  prompt: string
  saved_at: string | null
  expires_at: string | null
  created_at: string
  has_active_binding: boolean
}

type MutationResult = { ok: boolean; error?: string }

function fileTitle(file: File) {
  return file.name.replace(/\.[^.]+$/, "").trim().slice(0, 120) || "Арт"
}

function uploadFolder(collection: ArtCollection) {
  if (collection === "system") return "gm-private"
  if (collection === "comics") return "comics"
  return "gallery"
}

async function imageDimensions(file: File) {
  if (typeof createImageBitmap !== "function") return { width: 1, height: 1 }
  try {
    const bitmap = await createImageBitmap(file)
    const result = { width: Math.max(1, bitmap.width), height: Math.max(1, bitmap.height) }
    bitmap.close()
    return result
  } catch {
    return { width: 1, height: 1 }
  }
}

export function useUiV1ArtData() {
  const scope = useUiV1CampaignScope()
  const [campaignTitle, setCampaignTitle] = useState("")
  const [items, setItems] = useState<UiV1ArtItem[]>([])
  const [pages, setPages] = useState<UiV1ArtPage[]>([])
  const [generated, setGenerated] = useState<UiV1GeneratedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!scope.campaignId) return
    setLoading(true)

    const { data: campaignRow } = await supabase
      .from("campaigns")
      .select("title")
      .eq("id", scope.campaignId)
      .maybeSingle()
    setCampaignTitle(campaignRow?.title || "")

    const { data: artRows, error: artError } = await supabase
      .from("campaign_art_items")
      .select("id,asset_id,uploaded_by,character_id,location_id,title,caption,image_url,kind,collection,created_at")
      .eq("campaign_id", scope.campaignId)
      .order("created_at", { ascending: false })

    if (artError) {
      setItems([])
      setPages([])
      setGenerated([])
      setError(artError.message)
      setLoading(false)
      return
    }

    const nextItems = (artRows || []) as UiV1ArtItem[]
    setItems(nextItems)

    const pageResult = nextItems.length
      ? await supabase
          .from("campaign_art_pages")
          .select("id,art_item_id,page_number,image_url")
          .in("art_item_id", nextItems.map((item) => item.id))
          .order("page_number", { ascending: true })
      : { data: [], error: null }

    if (pageResult.error) {
      setPages([])
      setError(pageResult.error.message)
      setLoading(false)
      return
    }

    setPages((pageResult.data || []) as UiV1ArtPage[])

    if (scope.isOwner) {
      const { data, error: generatedError } = await supabase.rpc(
        "list_campaign_generated_media_admin_v1",
        { p_campaign_id: scope.campaignId },
      )

      if (generatedError) {
        setGenerated([])
        setError(generatedError.message)
        setLoading(false)
        return
      }

      setGenerated((data || []) as UiV1GeneratedAsset[])
    } else {
      setGenerated([])
    }

    setError(null)
    setLoading(false)
  }, [scope.campaignId, scope.isOwner])

  useEffect(() => {
    if (!scope.campaignId) {
      if (!scope.loading) setLoading(false)
      return
    }
    void load()
  }, [load, scope.campaignId, scope.loading])

  const counts = useMemo(() => {
    const base: Record<ArtCollection, number> = {
      comics: 0,
      world: 0,
      npc: 0,
      location: 0,
      player: 0,
      system: 0,
    }
    for (const item of items) base[item.collection] += 1
    return base
  }, [items])

  const upload = useCallback(async (
    collection: ArtCollection,
    files: File[],
  ): Promise<MutationResult> => {
    if (!scope.campaignId || files.length === 0) return { ok: false, error: "Файлы не выбраны." }
    if (collection === "system" ? !scope.isOwner : !scope.canManage) {
      return { ok: false, error: "Недостаточно прав для загрузки." }
    }

    setBusy(true)
    setError(null)
    const uploaded: string[] = []
    const createdIds: string[] = []

    try {
      if (collection === "comics") {
        for (const file of files) {
          const result = await uploadCampaignImage(file, uploadFolder(collection), scope.campaignId)
          if (!result.ok) throw new Error(result.error)
          uploaded.push(result.url)
        }

        const { data: userData } = await supabase.auth.getUser()
        const { data: artItem, error: insertError } = await supabase
          .from("campaign_art_items")
          .insert({
            campaign_id: scope.campaignId,
            uploaded_by: userData.user?.id || null,
            character_id: null,
            location_id: null,
            title: fileTitle(files[0]),
            caption: "",
            image_url: uploaded[0],
            kind: "comic",
            collection,
          })
          .select("id")
          .single()

        if (insertError || !artItem) throw new Error(insertError?.message || "Не удалось создать комикс.")
        createdIds.push(artItem.id)

        const { error: pagesError } = await supabase
          .from("campaign_art_pages")
          .insert(uploaded.map((imageUrl, index) => ({
            art_item_id: artItem.id,
            created_by: userData.user?.id,
            page_number: index + 1,
            image_url: imageUrl,
          })))

        if (pagesError) {
          await supabase.from("campaign_art_items").delete().eq("id", artItem.id)
          throw new Error(pagesError.message)
        }
      } else {
        const { data: userData } = await supabase.auth.getUser()
        for (const file of files) {
          const result = await uploadCampaignImage(file, uploadFolder(collection), scope.campaignId)
          if (!result.ok) throw new Error(result.error)
          uploaded.push(result.url)

          const { data: created, error: insertError } = await supabase
            .from("campaign_art_items")
            .insert({
              campaign_id: scope.campaignId,
              uploaded_by: userData.user?.id || null,
              character_id: null,
              location_id: null,
              title: fileTitle(file),
              caption: "",
              image_url: result.url,
              kind: "art",
              collection,
            })
            .select("id")
            .single()
          if (insertError || !created) throw new Error(insertError?.message || "Не удалось сохранить арт.")
          createdIds.push(created.id)

          if (collection === "system") {
            const dimensions = await imageDimensions(file)
            const { error: registerError } = await supabase.rpc(
              "register_system_media_v1",
              {
                p_campaign_id: scope.campaignId,
                p_art_item_id: created.id,
                p_storage_path: result.url,
                p_mime_type: file.type || "image/webp",
                p_width: dimensions.width,
                p_height: dimensions.height,
              },
            )
            if (registerError) throw new Error(registerError.message)
          }
        }
      }

      await load()
      return { ok: true }
    } catch (reason) {
      if (createdIds.length) {
        if (collection === "system") {
          for (const artItemId of createdIds) {
            await supabase.rpc("delete_system_media_v1", { p_art_item_id: artItemId })
          }
        } else {
          await supabase.from("campaign_art_items").delete().in("id", createdIds)
        }
      }
      await deleteCampaignMediaObjects(uploaded)
      const message = reason instanceof Error ? reason.message : "Не удалось загрузить арт."
      setError(message)
      return { ok: false, error: message }
    } finally {
      setBusy(false)
    }
  }, [load, scope.campaignId, scope.canManage, scope.isOwner])

  const deleteArt = useCallback(async (item: UiV1ArtItem): Promise<MutationResult> => {
    setBusy(true)
    setError(null)
    const paths = [
      item.image_url,
      ...pages.filter((page) => page.art_item_id === item.id).map((page) => page.image_url),
    ]

    if (item.collection === "system") {
      const { data, error: deleteError } = await supabase.rpc(
        "delete_system_media_v1",
        { p_art_item_id: item.id },
      )
      if (deleteError) {
        const message = /system_media_in_use/i.test(deleteError.message)
          ? "Этот системный материал уже используется. Сначала отвяжи его от объектов."
          : deleteError.message
        setBusy(false)
        setError(message)
        return { ok: false, error: message }
      }

      const payload = (data || {}) as { storage_path?: string }
      await deleteCampaignMediaObjects([payload.storage_path || item.image_url])
      await load()
      setBusy(false)
      return { ok: true }
    }

    const { error: deleteError } = await supabase
      .from("campaign_art_items")
      .delete()
      .eq("id", item.id)

    if (deleteError) {
      setBusy(false)
      setError(deleteError.message)
      return { ok: false, error: deleteError.message }
    }

    await deleteCampaignMediaObjects(paths)
    await load()
    setBusy(false)
    return { ok: true }
  }, [load, pages])

  const deleteGenerated = useCallback(async (
    asset: UiV1GeneratedAsset,
  ): Promise<MutationResult> => {
    if (!scope.isOwner) return { ok: false, error: "Только администратор может удалять генерации." }
    if (asset.has_active_binding || asset.status === "attached") {
      return { ok: false, error: "Этот файл уже используется. Сначала отвяжи его от контента." }
    }

    setBusy(true)
    setError(null)

    const { data, error: deleteError } = await supabase.rpc(
      "delete_generated_media_admin_v1",
      { p_asset_id: asset.id },
    )

    if (deleteError) {
      setBusy(false)
      setError(deleteError.message)
      return { ok: false, error: deleteError.message }
    }

    const payload = (data || {}) as { storage_bucket?: string; storage_path?: string }
    const bucket = payload.storage_bucket || asset.storage_bucket
    const path = payload.storage_path || asset.storage_path
    const { error: storageError } = await supabase.storage.from(bucket).remove([path])

    await load()
    setBusy(false)

    if (storageError) {
      const message = "Запись удалена, но Storage не подтвердил удаление файла: " + storageError.message
      setError(message)
      return { ok: false, error: message }
    }

    return { ok: true }
  }, [load, scope.isOwner])

  const deleteArts = useCallback(async (
    targets: UiV1ArtItem[],
  ): Promise<MutationResult & { deleted?: number; failed?: number }> => {
    if (!targets.length) return { ok: false, error: "Ничего не выбрано.", deleted: 0, failed: 0 }

    setBusy(true)
    setError(null)
    let deleted = 0
    let failed = 0
    const errors: string[] = []
    const storagePaths: string[] = []

    for (const item of targets) {
      const itemPaths = [
        item.image_url,
        ...pages.filter((page) => page.art_item_id === item.id).map((page) => page.image_url),
      ]

      if (item.collection === "system") {
        if (!scope.isOwner) {
          failed += 1
          errors.push("Системные материалы может удалять только администратор.")
          continue
        }

        const { data, error: deleteError } = await supabase.rpc(
          "delete_system_media_v1",
          { p_art_item_id: item.id },
        )

        if (deleteError) {
          failed += 1
          errors.push(
            /system_media_in_use/i.test(deleteError.message)
              ? "Один из системных материалов используется и не был удалён."
              : deleteError.message,
          )
          continue
        }

        const payload = (data || {}) as { storage_path?: string }
        storagePaths.push(payload.storage_path || item.image_url)
        deleted += 1
        continue
      }

      const { error: deleteError } = await supabase
        .from("campaign_art_items")
        .delete()
        .eq("id", item.id)

      if (deleteError) {
        failed += 1
        errors.push(deleteError.message)
        continue
      }

      storagePaths.push(...itemPaths)
      deleted += 1
    }

    if (storagePaths.length) await deleteCampaignMediaObjects(storagePaths)
    await load()
    setBusy(false)

    if (failed) {
      const message = `Удалено: ${deleted}. Не удалено: ${failed}. ${errors[0] || ""}`.trim()
      setError(message)
      return { ok: false, error: message, deleted, failed }
    }

    return { ok: true, deleted, failed }
  }, [load, pages, scope.isOwner])

  const deleteGeneratedMany = useCallback(async (
    targets: UiV1GeneratedAsset[],
  ): Promise<MutationResult & { deleted?: number; failed?: number }> => {
    if (!scope.isOwner) {
      return { ok: false, error: "Только администратор может удалять генерации.", deleted: 0, failed: targets.length }
    }
    if (!targets.length) return { ok: false, error: "Ничего не выбрано.", deleted: 0, failed: 0 }

    setBusy(true)
    setError(null)
    let deleted = 0
    let failed = 0
    const errors: string[] = []
    const byBucket = new Map<string, string[]>()

    for (const asset of targets) {
      if (asset.has_active_binding || asset.status === "attached") {
        failed += 1
        errors.push("Одна из генераций используется и не была удалена.")
        continue
      }

      const { data, error: deleteError } = await supabase.rpc(
        "delete_generated_media_admin_v1",
        { p_asset_id: asset.id },
      )

      if (deleteError) {
        failed += 1
        errors.push(deleteError.message)
        continue
      }

      const payload = (data || {}) as { storage_bucket?: string; storage_path?: string }
      const bucket = payload.storage_bucket || asset.storage_bucket
      const storagePath = payload.storage_path || asset.storage_path
      byBucket.set(bucket, [...(byBucket.get(bucket) || []), storagePath])
      deleted += 1
    }

    for (const [bucket, paths] of byBucket.entries()) {
      const { error: storageError } = await supabase.storage.from(bucket).remove(paths)
      if (storageError) errors.push(storageError.message)
    }

    await load()
    setBusy(false)

    if (failed || errors.length) {
      const message = `Удалено: ${deleted}. Не удалено: ${failed}. ${errors[0] || ""}`.trim()
      setError(message)
      return { ok: false, error: message, deleted, failed }
    }

    return { ok: true, deleted, failed }
  }, [load, scope.isOwner])

  return {
    ...scope,
    campaignTitle,
    items,
    pages,
    generated,
    counts,
    loading: scope.loading || loading,
    busy,
    error: scope.error || error,
    refresh: load,
    upload,
    deleteArt,
    deleteArts,
    deleteGenerated,
    deleteGeneratedMany,
  }
}
