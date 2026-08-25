import { useCallback, useEffect, useState } from "react"

import { supabase } from "../lib/supabase"
import { deleteCampaignMediaObject } from "../lib/mediaUpload"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import type {
  CharacterFeature,
  CharacterArt,
  CharacterSheet,
  CharacterSpell,
  CharacterSpellOption,
  DiaryComment,
  DiaryPost,
  FeatureInput,
  InventoryInput,
  InventoryItem,
  SpellInput,
} from "../types/characterSheet"

type Result = { ok: boolean; error?: string }

function sortInventory(items: InventoryItem[]) {
  return [...items].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  )
}

function sortSpells<T extends CharacterSpell>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      a.spell_level - b.spell_level ||
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name, "ru"),
  )
}

function sortFeatures(items: CharacterFeature[]) {
  return [...items].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  )
}

export function useCharacterSheet(characterId: string, campaignId: string) {
  const { user } = useAuth()
  const { canManage } = useCharacters()
  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [spells, setSpells] = useState<CharacterSpell[]>([])
  const [spellOptions, setSpellOptions] = useState<CharacterSpellOption[]>([])
  const [features, setFeatures] = useState<CharacterFeature[]>([])
  const [posts, setPosts] = useState<DiaryPost[]>([])
  const [comments, setComments] = useState<DiaryComment[]>([])
  const [arts, setArts] = useState<CharacterArt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [sheetResult, inventoryResult, spellsResult, spellOptionsResult, featuresResult, postsResult, artsResult] =
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
          .from("character_spell_options")
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
        supabase
          .from("campaign_art_items")
          .select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, created_at, updated_at")
          .eq("character_id", characterId)
          .order("created_at", { ascending: false }),
      ])

    const firstError =
      sheetResult.error ||
      inventoryResult.error ||
      spellsResult.error ||
      spellOptionsResult.error ||
      featuresResult.error ||
      postsResult.error ||
      artsResult.error

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
    setSpellOptions((spellOptionsResult.data || []) as CharacterSpellOption[])
    setFeatures((featuresResult.data || []) as CharacterFeature[])
    setPosts(nextPosts)
    setComments(nextComments)
    setArts((artsResult.data || []) as CharacterArt[])
    setLoading(false)
  }, [characterId])

  const reloadInventory = useCallback(async (): Promise<Result> => {
    const { data, error: inventoryError } = await supabase
      .from("character_inventory_items")
      .select("*")
      .eq("character_id", characterId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
    if (inventoryError) return { ok: false, error: inventoryError.message }
    setInventory((data || []) as InventoryItem[])
    return { ok: true }
  }, [characterId])

  const reloadSpellCollections = useCallback(async (): Promise<Result> => {
    const [spellResult, optionResult] = await Promise.all([
      supabase
        .from("character_spells")
        .select("*")
        .eq("character_id", characterId)
        .order("spell_level", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("character_spell_options")
        .select("*")
        .eq("character_id", characterId)
        .order("spell_level", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ])
    const collectionError = spellResult.error || optionResult.error
    if (collectionError) return { ok: false, error: collectionError.message }
    setSpells((spellResult.data || []) as CharacterSpell[])
    setSpellOptions((optionResult.data || []) as CharacterSpellOption[])
    return { ok: true }
  }, [characterId])

  useEffect(() => {
    void load()
  }, [load])

  const updateSheet = useCallback(
    async (input: Partial<CharacterSheet>): Promise<Result> => {
      let updateError: { message: string } | null = null
      const updatedAt = new Date().toISOString()

      if (canManage) {
        const patch = { ...input }
        delete patch.character_id
        delete patch.created_at
        patch.updated_at = updatedAt
        const result = await supabase
          .from("character_sheets")
          .update(patch)
          .eq("character_id", characterId)
        updateError = result.error
        if (!updateError) {
          setSheet((current) => current ? { ...current, ...patch } : current)
        }
      } else {
        const narrativePatch = {
          race: input.race ?? sheet?.race ?? "",
          background: input.background ?? sheet?.background ?? "",
          alignment: input.alignment ?? sheet?.alignment ?? "",
          proficiencies: input.proficiencies ?? sheet?.proficiencies ?? "",
          languages: input.languages ?? sheet?.languages ?? "",
          senses: input.senses ?? sheet?.senses ?? "",
          personality_traits: input.personality_traits ?? sheet?.personality_traits ?? "",
          ideals: input.ideals ?? sheet?.ideals ?? "",
          bonds: input.bonds ?? sheet?.bonds ?? "",
          flaws: input.flaws ?? sheet?.flaws ?? "",
          backstory: input.backstory ?? sheet?.backstory ?? "",
          notes: input.notes ?? sheet?.notes ?? "",
        }
        const result = await supabase.rpc("update_character_narrative", {
          p_character_id: characterId,
          p_race: narrativePatch.race,
          p_background: narrativePatch.background,
          p_alignment: narrativePatch.alignment,
          p_proficiencies: narrativePatch.proficiencies,
          p_languages: narrativePatch.languages,
          p_senses: narrativePatch.senses,
          p_personality_traits: narrativePatch.personality_traits,
          p_ideals: narrativePatch.ideals,
          p_bonds: narrativePatch.bonds,
          p_flaws: narrativePatch.flaws,
          p_backstory: narrativePatch.backstory,
          p_notes: narrativePatch.notes,
        })
        updateError = result.error
        if (!updateError) {
          setSheet((current) =>
            current ? { ...current, ...narrativePatch, updated_at: updatedAt } : current,
          )
        }
      }

      if (updateError) return { ok: false, error: updateError.message }
      return { ok: true }
    },
    [canManage, characterId, sheet],
  )

  const addInventoryItem = useCallback(
    async (input: InventoryInput): Promise<Result> => {
      const { data, error: insertError } = await supabase
        .from("character_inventory_items")
        .insert({
          character_id: characterId,
          name: input.name.trim(),
          quantity: input.quantity,
          weight: input.weight,
          equipped: input.category === "equipment" ? input.equipped : false,
          category: input.category,
          equipment_slot: input.category === "equipment" ? input.equipment_slot : null,
          image_url: input.image_url?.trim() || null,
          description: input.description.trim(),
        })
        .select("*")
        .single()

      if (insertError) return { ok: false, error: insertError.message }
      setInventory((current) => sortInventory([...current, data as InventoryItem]))
      return { ok: true }
    },
    [characterId],
  )

  const updateInventoryItem = useCallback(
    async (itemId: string, input: InventoryInput): Promise<Result> => {
      const { data, error: updateError } = await supabase
        .from("character_inventory_items")
        .update({
          name: input.name.trim(),
          quantity: input.quantity,
          weight: input.weight,
          equipped: input.category === "equipment" ? input.equipped : false,
          category: input.category,
          equipment_slot: input.category === "equipment" ? input.equipment_slot : null,
          image_url: input.image_url?.trim() || null,
          description: input.description.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId)
        .eq("character_id", characterId)
        .select("*")
        .single()

      if (updateError) return { ok: false, error: updateError.message }
      setInventory((current) =>
        sortInventory(current.map((item) => item.id === itemId ? data as InventoryItem : item)),
      )
      return { ok: true }
    },
    [characterId],
  )

  const deleteInventoryItem = useCallback(
    async (itemId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_inventory_items")
        .delete()
        .eq("id", itemId)
        .eq("character_id", characterId)

      if (deleteError) return { ok: false, error: deleteError.message }
      setInventory((current) => current.filter((item) => item.id !== itemId))
      return { ok: true }
    },
    [characterId],
  )

  const setInventoryEquipped = useCallback(
    async (
      itemId: string,
      equipped: boolean,
      equipmentSlot: InventoryItem["equipment_slot"],
    ): Promise<Result> => {
      const { error: equipError } = await supabase.rpc(
        "set_character_inventory_equipped",
        {
          p_item_id: itemId,
          p_equipped: equipped,
          p_equipment_slot: equipmentSlot,
        },
      )

      if (equipError) return { ok: false, error: equipError.message }
      return reloadInventory()
    },
    [reloadInventory],
  )

  const setSpellcastingEnabled = useCallback(
    async (enabled: boolean): Promise<Result> => {
      const { error: toggleError } = await supabase.rpc(
        "set_character_spellcasting_enabled",
        {
          p_character_id: characterId,
          p_enabled: enabled,
        },
      )

      if (toggleError) return { ok: false, error: toggleError.message }
      setSheet((current) =>
        current
          ? { ...current, spellcasting_enabled: enabled, updated_at: new Date().toISOString() }
          : current,
      )
      return { ok: true }
    },
    [characterId],
  )

  const addSpell = useCallback(
    async (input: SpellInput): Promise<Result> => {
      const { data, error: insertError } = await supabase
        .from("character_spells")
        .insert({ character_id: characterId, ...input })
        .select("*")
        .single()

      if (insertError) return { ok: false, error: insertError.message }
      setSpells((current) => sortSpells([...current, data as CharacterSpell]))
      return { ok: true }
    },
    [characterId],
  )

  const updateSpell = useCallback(
    async (spellId: string, input: SpellInput): Promise<Result> => {
      const { data, error: updateError } = await supabase
        .from("character_spells")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", spellId)
        .eq("character_id", characterId)
        .select("*")
        .single()

      if (updateError) return { ok: false, error: updateError.message }
      setSpells((current) =>
        sortSpells(current.map((spell) => spell.id === spellId ? data as CharacterSpell : spell)),
      )
      return { ok: true }
    },
    [characterId],
  )

  const deleteSpell = useCallback(
    async (spellId: string): Promise<Result> => {
      const { error: deleteError } = await supabase.rpc(
        "forget_character_spell",
        { p_spell_id: spellId },
      )

      if (deleteError) return { ok: false, error: deleteError.message }
      setSpells((current) => current.filter((spell) => spell.id !== spellId))
      return { ok: true }
    },
    [],
  )

  const addSpellOption = useCallback(
    async (input: SpellInput): Promise<Result> => {
      const { data, error: insertError } = await supabase
        .from("character_spell_options")
        .insert({
          character_id: characterId,
          granted_by: user.id,
          ...input,
        })
        .select("*")
        .single()
      if (insertError) return { ok: false, error: insertError.message }
      setSpellOptions((current) =>
        sortSpells([...current, data as CharacterSpellOption]),
      )
      return { ok: true }
    },
    [characterId, user.id],
  )

  const updateSpellOption = useCallback(
    async (optionId: string, input: SpellInput): Promise<Result> => {
      const { data, error: updateError } = await supabase
        .from("character_spell_options")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", optionId)
        .eq("character_id", characterId)
        .select("*")
        .single()
      if (updateError) return { ok: false, error: updateError.message }
      setSpellOptions((current) =>
        sortSpells(current.map((option) => option.id === optionId ? data as CharacterSpellOption : option)),
      )
      return { ok: true }
    },
    [characterId],
  )

  const deleteSpellOption = useCallback(
    async (optionId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_spell_options")
        .delete()
        .eq("id", optionId)
        .eq("character_id", characterId)
      if (deleteError) return { ok: false, error: deleteError.message }
      setSpellOptions((current) => current.filter((option) => option.id !== optionId))
      return { ok: true }
    },
    [characterId],
  )

  const learnSpell = useCallback(
    async (optionId: string): Promise<Result> => {
      const { error: learnError } = await supabase.rpc("learn_character_spell", {
        p_option_id: optionId,
      })
      if (learnError) return { ok: false, error: learnError.message }
      return reloadSpellCollections()
    },
    [reloadSpellCollections],
  )

  const setSpellPrepared = useCallback(
    async (spellId: string, prepared: boolean): Promise<Result> => {
      const { error: preparedError } = await supabase.rpc(
        "set_character_spell_prepared",
        { p_spell_id: spellId, p_prepared: prepared },
      )
      if (preparedError) return { ok: false, error: preparedError.message }
      setSpells((current) =>
        current.map((spell) =>
          spell.id === spellId
            ? { ...spell, prepared, updated_at: new Date().toISOString() }
            : spell,
        ),
      )
      return { ok: true }
    },
    [],
  )

  const addFeature = useCallback(
    async (input: FeatureInput): Promise<Result> => {
      const { data, error: insertError } = await supabase
        .from("character_features")
        .insert({ character_id: characterId, ...input })
        .select("*")
        .single()

      if (insertError) return { ok: false, error: insertError.message }
      setFeatures((current) => sortFeatures([...current, data as CharacterFeature]))
      return { ok: true }
    },
    [characterId],
  )

  const updateFeature = useCallback(
    async (featureId: string, input: FeatureInput): Promise<Result> => {
      const { data, error: updateError } = await supabase
        .from("character_features")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", featureId)
        .eq("character_id", characterId)
        .select("*")
        .single()

      if (updateError) return { ok: false, error: updateError.message }
      setFeatures((current) =>
        sortFeatures(current.map((feature) => feature.id === featureId ? data as CharacterFeature : feature)),
      )
      return { ok: true }
    },
    [characterId],
  )

  const deleteFeature = useCallback(
    async (featureId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_features")
        .delete()
        .eq("id", featureId)
        .eq("character_id", characterId)

      if (deleteError) return { ok: false, error: deleteError.message }
      setFeatures((current) => current.filter((feature) => feature.id !== featureId))
      return { ok: true }
    },
    [characterId],
  )

  const addDiaryPost = useCallback(
    async (body: string, mediaUrl: string | null = null): Promise<Result> => {
      const { data, error: insertError } = await supabase
        .from("character_diary_posts")
        .insert({
          character_id: characterId,
          created_by: user.id,
          body: body.trim(),
          media_url: mediaUrl,
        })
        .select("*")
        .single()

      if (insertError) {
        if (mediaUrl) void deleteCampaignMediaObject(mediaUrl)
        return { ok: false, error: insertError.message }
      }
      setPosts((current) => [data as DiaryPost, ...current])
      return { ok: true }
    },
    [characterId, user.id],
  )

  const updateDiaryPost = useCallback(
    async (postId: string, body: string): Promise<Result> => {
      const { data, error: updateError } = await supabase
        .from("character_diary_posts")
        .update({ body: body.trim(), updated_at: new Date().toISOString() })
        .eq("id", postId)
        .eq("character_id", characterId)
        .select("*")
        .single()

      if (updateError) return { ok: false, error: updateError.message }
      setPosts((current) => current.map((post) => post.id === postId ? data as DiaryPost : post))
      return { ok: true }
    },
    [characterId],
  )

  const deleteDiaryPost = useCallback(
    async (postId: string): Promise<Result> => {
      const target = posts.find((post) => post.id === postId)
      const { error: deleteError } = await supabase
        .from("character_diary_posts")
        .delete()
        .eq("id", postId)

      if (deleteError) return { ok: false, error: deleteError.message }
      setPosts((current) => current.filter((post) => post.id !== postId))
      setComments((current) => current.filter((comment) => comment.post_id !== postId))
      if (target?.media_url) void deleteCampaignMediaObject(target.media_url)
      return { ok: true }
    },
    [posts],
  )

  const addComment = useCallback(
    async (postId: string, body: string): Promise<Result> => {
      const { data, error: insertError } = await supabase
        .from("character_diary_comments")
        .insert({
          post_id: postId,
          created_by: user.id,
          body: body.trim(),
        })
        .select("*")
        .single()

      if (insertError) return { ok: false, error: insertError.message }
      setComments((current) =>
        [...current, data as DiaryComment].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      )
      return { ok: true }
    },
    [user.id],
  )

  const deleteComment = useCallback(
    async (commentId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_diary_comments")
        .delete()
        .eq("id", commentId)

      if (deleteError) return { ok: false, error: deleteError.message }
      setComments((current) => current.filter((comment) => comment.id !== commentId))
      return { ok: true }
    },
    [],
  )

  const addArt = useCallback(
    async (title: string, imageUrl: string): Promise<Result> => {
      const { data, error: insertError } = await supabase
        .from("campaign_art_items")
        .insert({
          campaign_id: campaignId,
          uploaded_by: user.id,
          character_id: characterId,
          title: title.trim() || "Арт персонажа",
          image_url: imageUrl,
        })
        .select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, created_at, updated_at")
        .single()
      if (insertError) {
        void deleteCampaignMediaObject(imageUrl)
        return { ok: false, error: insertError.message }
      }
      setArts((current) => [data as CharacterArt, ...current])
      return { ok: true }
    },
    [campaignId, characterId, user.id],
  )

  const updateArt = useCallback(
    async (artId: string, title: string, caption: string): Promise<Result> => {
      const { data, error: updateError } = await supabase
        .from("campaign_art_items")
        .update({
          title: title.trim() || "Арт персонажа",
          caption: caption.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", artId)
        .eq("character_id", characterId)
        .select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, created_at, updated_at")
        .single()

      if (updateError) return { ok: false, error: updateError.message }
      setArts((current) => current.map((art) => art.id === artId ? data as CharacterArt : art))
      return { ok: true }
    },
    [characterId],
  )

  const deleteArt = useCallback(
    async (artId: string): Promise<Result> => {
      const target = arts.find((art) => art.id === artId)
      const { error: deleteError } = await supabase
        .from("campaign_art_items")
        .delete()
        .eq("id", artId)
      if (deleteError) return { ok: false, error: deleteError.message }
      setArts((current) => current.filter((art) => art.id !== artId))
      if (target?.image_url) void deleteCampaignMediaObject(target.image_url)
      return { ok: true }
    },
    [arts],
  )

  return {
    sheet,
    inventory,
    spells,
    spellOptions,
    features,
    posts,
    comments,
    arts,
    loading,
    error,
    reload: load,
    updateSheet,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    setInventoryEquipped,
    setSpellcastingEnabled,
    addSpell,
    updateSpell,
    deleteSpell,
    addSpellOption,
    updateSpellOption,
    deleteSpellOption,
    learnSpell,
    setSpellPrepared,
    addFeature,
    updateFeature,
    deleteFeature,
    addDiaryPost,
    updateDiaryPost,
    deleteDiaryPost,
    addComment,
    deleteComment,
    addArt,
    updateArt,
    deleteArt,
  }
}
