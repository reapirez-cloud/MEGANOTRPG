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

export function useUiV1ArtData() {
  const scope = useUiV1CampaignScope()
  const [items, setItems] = useState<UiV1ArtItem[]>([])
  const [pages, setPages] = useState<UiV1ArtPage[]>([])
  const [generated, setGenerated] = useState<UiV1GeneratedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!scope.campaignId) return
    setLoading(true)

    const { data: artRows, error: artError } = await supabase
      .from("campaign_art_items")
      .select("id,uploaded_by,character_id,location_id,title,caption,image_url,kind,collection,created_at")
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
            title: fileTitle(files[0]),
            caption: "",
            image_url: uploaded[0],
            kind: "comic",
            collection,
          })
          .select("id")
          .single()

        if (insertError || !artItem) throw new Error(insertError?.message || "Не удалось создать комикс.")

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

          const { error: insertError } = await supabase
            .from("campaign_art_items")
            .insert({
              campaign_id: scope.campaignId,
              uploaded_by: userData.user?.id || null,
              title: fileTitle(file),
              caption: "",
              image_url: result.url,
              kind: "art",
              collection,
            })
          if (insertError) throw new Error(insertError.message)
        }
      }

      await load()
      return { ok: true }
    } catch (reason) {
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

  return {
    ...scope,
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
    deleteGenerated,
  }
}
