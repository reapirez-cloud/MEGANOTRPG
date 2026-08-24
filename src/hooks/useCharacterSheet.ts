import { useCallback, useEffect, useState } from "react"

import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import type {
  CharacterFeature,
  CharacterSheet,
  CharacterSpell,
  DiaryComment,
  DiaryPost,
  FeatureInput,
  InventoryInput,
  InventoryItem,
  SpellInput,
} from "../types/characterSheet"

type Result = { ok: boolean; error?: string }

export function useCharacterSheet(characterId: string) {
  const { user } = useAuth()
  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [spells, setSpells] = useState<CharacterSpell[]>([])
  const [features, setFeatures] = useState<CharacterFeature[]>([])
  const [posts, setPosts] = useState<DiaryPost[]>([])
  const [comments, setComments] = useState<DiaryComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [sheetResult, inventoryResult, spellsResult, featuresResult, postsResult] =
      await Promise.all([
        supabase
          .from("character_sheets")
          .select("*")
          .eq("character_id", characterId)
          .maybeSingle(),
        supabase
          .from("character_inventory_items")
          .select("*")
          .eq("character_id", characterId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("character_spells")
          .select("*")
          .eq("character_id", characterId)
          .order("spell_level", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("character_features")
          .select("*")
          .eq("character_id", characterId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("character_diary_posts")
          .select("*")
          .eq("character_id", characterId)
          .order("created_at", { ascending: false }),
      ])

    const firstError =
      sheetResult.error ||
      inventoryResult.error ||
      spellsResult.error ||
      featuresResult.error ||
      postsResult.error

    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const nextPosts = (postsResult.data || []) as DiaryPost[]
    let nextComments: DiaryComment[] = []

    if (nextPosts.length > 0) {
      const { data: commentRows, error: commentsError } = await supabase
        .from("character_diary_comments")
        .select("*")
        .in("post_id", nextPosts.map((post) => post.id))
        .order("created_at", { ascending: true })

      if (commentsError) {
        setError(commentsError.message)
        setLoading(false)
        return
      }

      nextComments = (commentRows || []) as DiaryComment[]
    }

    setSheet((sheetResult.data || null) as CharacterSheet | null)
    setInventory((inventoryResult.data || []) as InventoryItem[])
    setSpells((spellsResult.data || []) as CharacterSpell[])
    setFeatures((featuresResult.data || []) as CharacterFeature[])
    setPosts(nextPosts)
    setComments(nextComments)
    setLoading(false)
  }, [characterId])

  useEffect(() => {
    void load()
  }, [load])

  const updateSheet = useCallback(
    async (input: Partial<CharacterSheet>): Promise<Result> => {
      const patch = { ...input }
      delete patch.character_id
      delete patch.created_at
      patch.updated_at = new Date().toISOString()

      const { error: updateError } = await supabase
        .from("character_sheets")
        .update(patch)
        .eq("character_id", characterId)

      if (updateError) return { ok: false, error: updateError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const addInventoryItem = useCallback(
    async (input: InventoryInput): Promise<Result> => {
      const { error: insertError } = await supabase
        .from("character_inventory_items")
        .insert({
          character_id: characterId,
          name: input.name.trim(),
          quantity: input.quantity,
          weight: input.weight,
          equipped: input.equipped,
          image_url: input.image_url?.trim() || null,
          description: input.description.trim(),
        })

      if (insertError) return { ok: false, error: insertError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const updateInventoryItem = useCallback(
    async (itemId: string, input: InventoryInput): Promise<Result> => {
      const { error: updateError } = await supabase
        .from("character_inventory_items")
        .update({
          name: input.name.trim(),
          quantity: input.quantity,
          weight: input.weight,
          equipped: input.equipped,
          image_url: input.image_url?.trim() || null,
          description: input.description.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId)
        .eq("character_id", characterId)

      if (updateError) return { ok: false, error: updateError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const deleteInventoryItem = useCallback(
    async (itemId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_inventory_items")
        .delete()
        .eq("id", itemId)
        .eq("character_id", characterId)

      if (deleteError) return { ok: false, error: deleteError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const addSpell = useCallback(
    async (input: SpellInput): Promise<Result> => {
      const { error: insertError } = await supabase
        .from("character_spells")
        .insert({ character_id: characterId, ...input })

      if (insertError) return { ok: false, error: insertError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const updateSpell = useCallback(
    async (spellId: string, input: SpellInput): Promise<Result> => {
      const { error: updateError } = await supabase
        .from("character_spells")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", spellId)
        .eq("character_id", characterId)

      if (updateError) return { ok: false, error: updateError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const deleteSpell = useCallback(
    async (spellId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_spells")
        .delete()
        .eq("id", spellId)
        .eq("character_id", characterId)

      if (deleteError) return { ok: false, error: deleteError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const addFeature = useCallback(
    async (input: FeatureInput): Promise<Result> => {
      const { error: insertError } = await supabase
        .from("character_features")
        .insert({ character_id: characterId, ...input })

      if (insertError) return { ok: false, error: insertError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const updateFeature = useCallback(
    async (featureId: string, input: FeatureInput): Promise<Result> => {
      const { error: updateError } = await supabase
        .from("character_features")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", featureId)
        .eq("character_id", characterId)

      if (updateError) return { ok: false, error: updateError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const deleteFeature = useCallback(
    async (featureId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_features")
        .delete()
        .eq("id", featureId)
        .eq("character_id", characterId)

      if (deleteError) return { ok: false, error: deleteError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const addDiaryPost = useCallback(
    async (body: string): Promise<Result> => {
      const { error: insertError } = await supabase
        .from("character_diary_posts")
        .insert({
          character_id: characterId,
          created_by: user.id,
          body: body.trim(),
        })

      if (insertError) return { ok: false, error: insertError.message }
      await load()
      return { ok: true }
    },
    [characterId, load, user.id],
  )

  const deleteDiaryPost = useCallback(
    async (postId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_diary_posts")
        .delete()
        .eq("id", postId)

      if (deleteError) return { ok: false, error: deleteError.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const addComment = useCallback(
    async (postId: string, body: string): Promise<Result> => {
      const { error: insertError } = await supabase
        .from("character_diary_comments")
        .insert({
          post_id: postId,
          created_by: user.id,
          body: body.trim(),
        })

      if (insertError) return { ok: false, error: insertError.message }
      await load()
      return { ok: true }
    },
    [load, user.id],
  )

  const deleteComment = useCallback(
    async (commentId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_diary_comments")
        .delete()
        .eq("id", commentId)

      if (deleteError) return { ok: false, error: deleteError.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  return {
    sheet,
    inventory,
    spells,
    features,
    posts,
    comments,
    loading,
    error,
    reload: load,
    updateSheet,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    addSpell,
    updateSpell,
    deleteSpell,
    addFeature,
    updateFeature,
    deleteFeature,
    addDiaryPost,
    deleteDiaryPost,
    addComment,
    deleteComment,
  }
}
