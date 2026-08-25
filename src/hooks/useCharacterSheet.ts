import { useCallback, useEffect, useState } from "react"

import { supabase } from "../lib/supabase"
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

  useEffect(() => {
    void load()
  }, [load])

  const updateSheet = useCallback(
    async (input: Partial<CharacterSheet>): Promise<Result> => {
      let updateError: { message: string } | null = null

      if (canManage) {
        const patch = { ...input }
        delete patch.character_id
        delete patch.created_at
        patch.updated_at = new Date().toISOString()
        const result = await supabase
          .from("character_sheets")
          .update(patch)
          .eq("character_id", characterId)
        updateError = result.error
      } else {
        const result = await supabase.rpc("update_character_narrative", {
          p_character_id: characterId,
          p_race: input.race ?? sheet?.race ?? "",
          p_background: input.background ?? sheet?.background ?? "",
          p_alignment: input.alignment ?? sheet?.alignment ?? "",
          p_proficiencies: input.proficiencies ?? sheet?.proficiencies ?? "",
          p_languages: input.languages ?? sheet?.languages ?? "",
          p_senses: input.senses ?? sheet?.senses ?? "",
          p_personality_traits: input.personality_traits ?? sheet?.personality_traits ?? "",
          p_ideals: input.ideals ?? sheet?.ideals ?? "",
          p_bonds: input.bonds ?? sheet?.bonds ?? "",
          p_flaws: input.flaws ?? sheet?.flaws ?? "",
          p_backstory: input.backstory ?? sheet?.backstory ?? "",
          p_notes: input.notes ?? sheet?.notes ?? "",
        })
        updateError = result.error
      }

      if (updateError) return { ok: false, error: updateError.message }
      await load()
      return { ok: true }
    },
    [canManage, characterId, load, sheet],
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
          equipped: input.category === "equipment" ? input.equipped : false,
          category: input.category,
          equipment_slot: input.category === "equipment" ? input.equipment_slot : null,
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
          equipped: input.category === "equipment" ? input.equipped : false,
          category: input.category,
          equipment_slot: input.category === "equipment" ? input.equipment_slot : null,
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
      await load()
      return { ok: true }
    },
    [load],
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
      const { error: deleteError } = await supabase.rpc(
        "forget_character_spell",
        { p_spell_id: spellId },
      )

      if (deleteError) return { ok: false, error: deleteError.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const addSpellOption = useCallback(
    async (input: SpellInput): Promise<Result> => {
      const { error: insertError } = await supabase
        .from("character_spell_options")
        .insert({
          character_id: characterId,
          granted_by: user.id,
          ...input,
        })
      if (insertError) return { ok: false, error: insertError.message }
      await load()
      return { ok: true }
    },
    [characterId, load, user.id],
  )

  const updateSpellOption = useCallback(
    async (optionId: string, input: SpellInput): Promise<Result> => {
      const { error: updateError } = await supabase
        .from("character_spell_options")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", optionId)
        .eq("character_id", characterId)
      if (updateError) return { ok: false, error: updateError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const deleteSpellOption = useCallback(
    async (optionId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("character_spell_options")
        .delete()
        .eq("id", optionId)
        .eq("character_id", characterId)
      if (deleteError) return { ok: false, error: deleteError.message }
      await load()
      return { ok: true }
    },
    [characterId, load],
  )

  const learnSpell = useCallback(
    async (optionId: string): Promise<Result> => {
      const { error: learnError } = await supabase.rpc("learn_character_spell", {
        p_option_id: optionId,
      })
      if (learnError) return { ok: false, error: learnError.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const setSpellPrepared = useCallback(
    async (spellId: string, prepared: boolean): Promise<Result> => {
      const { error: preparedError } = await supabase.rpc(
        "set_character_spell_prepared",
        { p_spell_id: spellId, p_prepared: prepared },
      )
      if (preparedError) return { ok: false, error: preparedError.message }
      await load()
      return { ok: true }
    },
    [load],
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
    async (body: string, mediaUrl: string | null = null): Promise<Result> => {
      const { error: insertError } = await supabase
        .from("character_diary_posts")
        .insert({
          character_id: characterId,
          created_by: user.id,
          body: body.trim(),
          media_url: mediaUrl,
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

  const addArt = useCallback(
    async (title: string, imageUrl: string): Promise<Result> => {
      const { error: insertError } = await supabase
        .from("campaign_art_items")
        .insert({
          campaign_id: campaignId,
          uploaded_by: user.id,
          character_id: characterId,
          title: title.trim() || "Арт персонажа",
          image_url: imageUrl,
        })
      if (insertError) return { ok: false, error: insertError.message }
      await load()
      return { ok: true }
    },
    [campaignId, characterId, load, user.id],
  )

  const deleteArt = useCallback(
    async (artId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("campaign_art_items")
        .delete()
        .eq("id", artId)
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
    deleteDiaryPost,
    addComment,
    deleteComment,
    addArt,
    deleteArt,
  }
}
