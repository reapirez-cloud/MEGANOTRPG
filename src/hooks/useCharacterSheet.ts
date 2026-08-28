import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { deleteCampaignMediaObject } from "../lib/mediaUpload"
import { registerCharacterInventory } from "../lib/characterMechanics"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import type { CharacterFeature, CharacterArt, CharacterSheet, CharacterSpell, CharacterSpellOption, DiaryComment, DiaryPost, FeatureInput, InventoryInput, InventoryItem, SpellInput } from "../types/characterSheet"

type Result = { ok: boolean; error?: string }
const sortInventory = (items: InventoryItem[]) => [...items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
const sortSpells = <T extends CharacterSpell>(items: T[]) => [...items].sort((a, b) => a.spell_level - b.spell_level || a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru"))
const sortFeatures = (items: CharacterFeature[]) => [...items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))

export function useCharacterSheet(characterId: string, campaignId: string) {
  const { user } = useAuth(); const { canManage } = useCharacters()
  const [sheet, setSheet] = useState<CharacterSheet | null>(null); const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [spells, setSpells] = useState<CharacterSpell[]>([]); const [spellOptions, setSpellOptions] = useState<CharacterSpellOption[]>([]); const [features, setFeatures] = useState<CharacterFeature[]>([])
  const [posts, setPosts] = useState<DiaryPost[]>([]); const [comments, setComments] = useState<DiaryComment[]>([]); const [arts, setArts] = useState<CharacterArt[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [sheetResult, inventoryResult, spellsResult, spellOptionsResult, featuresResult, postsResult, artsResult] = await Promise.all([
      supabase.from("character_sheets").select("*").eq("character_id", characterId).maybeSingle(),
      supabase.from("character_inventory_items").select("*").eq("character_id", characterId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("character_spells").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true }),
      supabase.from("character_spell_options").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true }),
      supabase.from("character_features").select("*").eq("character_id", characterId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("character_diary_posts").select("*").eq("character_id", characterId).order("created_at", { ascending: false }),
      supabase.from("campaign_art_items").select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, created_at, updated_at").eq("character_id", characterId).order("created_at", { ascending: false }),
    ])
    const firstError = sheetResult.error || inventoryResult.error || spellsResult.error || spellOptionsResult.error || featuresResult.error || postsResult.error || artsResult.error
    if (firstError) { setError(firstError.message); setLoading(false); return }
    const nextPosts = (postsResult.data || []) as DiaryPost[]; let nextComments: DiaryComment[] = []
    if (nextPosts.length) {
      const { data: rows, error: commentsError } = await supabase.from("character_diary_comments").select("*").in("post_id", nextPosts.map((post) => post.id)).order("created_at", { ascending: true })
      if (commentsError) { setError(commentsError.message); setLoading(false); return }; nextComments = (rows || []) as DiaryComment[]
    }
    const nextInventory = (inventoryResult.data || []) as InventoryItem[]; registerCharacterInventory(characterId, nextInventory); setInventory(nextInventory)
    setSheet((sheetResult.data || null) as CharacterSheet | null); setSpells((spellsResult.data || []) as CharacterSpell[]); setSpellOptions((spellOptionsResult.data || []) as CharacterSpellOption[])
    setFeatures((featuresResult.data || []) as CharacterFeature[]); setPosts(nextPosts); setComments(nextComments); setArts((artsResult.data || []) as CharacterArt[]); setLoading(false)
  }, [characterId])

  const reloadInventory = useCallback(async (): Promise<Result> => {
    const { data, error: e } = await supabase.from("character_inventory_items").select("*").eq("character_id", characterId).order("sort_order", { ascending: true }).order("created_at", { ascending: true })
    if (e) return { ok: false, error: e.message }; const next = (data || []) as InventoryItem[]; registerCharacterInventory(characterId, next); setInventory(next); return { ok: true }
  }, [characterId])
  const reloadSpellCollections = useCallback(async (): Promise<Result> => {
    const [a, b] = await Promise.all([
      supabase.from("character_spells").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true }),
      supabase.from("character_spell_options").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    ]); const e = a.error || b.error; if (e) return { ok: false, error: e.message }; setSpells((a.data || []) as CharacterSpell[]); setSpellOptions((b.data || []) as CharacterSpellOption[]); return { ok: true }
  }, [characterId])
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  const updateSheet = useCallback(async (input: Partial<CharacterSheet>): Promise<Result> => {
    let updateError: { message: string } | null = null; const updatedAt = new Date().toISOString()
    if (canManage) {
      const patch = { ...input }; delete patch.character_id; delete patch.created_at; patch.updated_at = updatedAt
      const result = await supabase.from("character_sheets").update(patch).eq("character_id", characterId); updateError = result.error
      if (!updateError) setSheet((current) => current ? { ...current, ...patch } : current)
    } else {
      const p = { race: input.race ?? sheet?.race ?? "", background: input.background ?? sheet?.background ?? "", alignment: input.alignment ?? sheet?.alignment ?? "", proficiencies: input.proficiencies ?? sheet?.proficiencies ?? "", languages: input.languages ?? sheet?.languages ?? "", senses: input.senses ?? sheet?.senses ?? "", personality_traits: input.personality_traits ?? sheet?.personality_traits ?? "", ideals: input.ideals ?? sheet?.ideals ?? "", bonds: input.bonds ?? sheet?.bonds ?? "", flaws: input.flaws ?? sheet?.flaws ?? "", backstory: input.backstory ?? sheet?.backstory ?? "", notes: input.notes ?? sheet?.notes ?? "" }
      const result = await supabase.rpc("update_character_narrative", { p_character_id: characterId, p_race: p.race, p_background: p.background, p_alignment: p.alignment, p_proficiencies: p.proficiencies, p_languages: p.languages, p_senses: p.senses, p_personality_traits: p.personality_traits, p_ideals: p.ideals, p_bonds: p.bonds, p_flaws: p.flaws, p_backstory: p.backstory, p_notes: p.notes }); updateError = result.error
      if (!updateError) setSheet((current) => current ? { ...current, ...p, updated_at: updatedAt } : current)
    }
    return updateError ? { ok: false, error: updateError.message } : { ok: true }
  }, [canManage, characterId, sheet])

  const addInventoryItem = useCallback(async (input: InventoryInput): Promise<Result> => {
    const { data, error: e } = await supabase.from("character_inventory_items").insert({ character_id: characterId, name: input.name.trim(), quantity: input.quantity, weight: input.weight, equipped: input.category === "equipment" ? input.equipped : false, category: input.category, equipment_slot: input.category === "equipment" ? input.equipment_slot : null, image_url: input.image_url?.trim() || null, description: input.description.trim(), mechanics: input.mechanics || [] }).select("*").single()
    if (e) return { ok: false, error: e.message }; const row = data as InventoryItem; setInventory((current) => { const next = sortInventory([...current, row]); registerCharacterInventory(characterId, next); return next }); return { ok: true }
  }, [characterId])
  const updateInventoryItem = useCallback(async (itemId: string, input: InventoryInput): Promise<Result> => {
    const { data, error: e } = await supabase.from("character_inventory_items").update({ name: input.name.trim(), quantity: input.quantity, weight: input.weight, equipped: input.category === "equipment" ? input.equipped : false, category: input.category, equipment_slot: input.category === "equipment" ? input.equipment_slot : null, image_url: input.image_url?.trim() || null, description: input.description.trim(), mechanics: input.mechanics || [], updated_at: new Date().toISOString() }).eq("id", itemId).eq("character_id", characterId).select("*").single()
    if (e) return { ok: false, error: e.message }; const row = data as InventoryItem; setInventory((current) => { const next = sortInventory(current.map((x) => x.id === itemId ? row : x)); registerCharacterInventory(characterId, next); return next }); return { ok: true }
  }, [characterId])
  const deleteInventoryItem = useCallback(async (itemId: string): Promise<Result> => {
    const { error: e } = await supabase.from("character_inventory_items").delete().eq("id", itemId).eq("character_id", characterId); if (e) return { ok: false, error: e.message }
    setInventory((current) => { const next = current.filter((x) => x.id !== itemId); registerCharacterInventory(characterId, next); return next }); return { ok: true }
  }, [characterId])
  const setInventoryEquipped = useCallback(async (itemId: string, equipped: boolean, equipmentSlot: InventoryItem["equipment_slot"]): Promise<Result> => {
    const { error: e } = await supabase.rpc("set_character_inventory_equipped", { p_item_id: itemId, p_equipped: equipped, p_equipment_slot: equipmentSlot }); return e ? { ok: false, error: e.message } : reloadInventory()
  }, [reloadInventory])

  const setSpellcastingEnabled = useCallback(async (enabled: boolean): Promise<Result> => { const { error: e } = await supabase.rpc("set_character_spellcasting_enabled", { p_character_id: characterId, p_enabled: enabled }); if (e) return { ok: false, error: e.message }; setSheet((c) => c ? { ...c, spellcasting_enabled: enabled, updated_at: new Date().toISOString() } : c); return { ok: true } }, [characterId])
  const addSpell = useCallback(async (input: SpellInput): Promise<Result> => { const { data, error: e } = await supabase.from("character_spells").insert({ character_id: characterId, ...input }).select("*").single(); if (e) return { ok: false, error: e.message }; setSpells((c) => sortSpells([...c, data as CharacterSpell])); return { ok: true } }, [characterId])
  const updateSpell = useCallback(async (id: string, input: SpellInput): Promise<Result> => { const { data, error: e } = await supabase.from("character_spells").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).eq("character_id", characterId).select("*").single(); if (e) return { ok: false, error: e.message }; setSpells((c) => sortSpells(c.map((x) => x.id === id ? data as CharacterSpell : x))); return { ok: true } }, [characterId])
  const deleteSpell = useCallback(async (id: string): Promise<Result> => { const { error: e } = await supabase.rpc("forget_character_spell", { p_spell_id: id }); if (e) return { ok: false, error: e.message }; setSpells((c) => c.filter((x) => x.id !== id)); return { ok: true } }, [])
  const addSpellOption = useCallback(async (input: SpellInput): Promise<Result> => { const { data, error: e } = await supabase.from("character_spell_options").insert({ character_id: characterId, granted_by: user.id, ...input }).select("*").single(); if (e) return { ok: false, error: e.message }; setSpellOptions((c) => sortSpells([...c, data as CharacterSpellOption])); return { ok: true } }, [characterId, user.id])
  const updateSpellOption = useCallback(async (id: string, input: SpellInput): Promise<Result> => { const { data, error: e } = await supabase.from("character_spell_options").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).eq("character_id", characterId).select("*").single(); if (e) return { ok: false, error: e.message }; setSpellOptions((c) => sortSpells(c.map((x) => x.id === id ? data as CharacterSpellOption : x))); return { ok: true } }, [characterId])
  const deleteSpellOption = useCallback(async (id: string): Promise<Result> => { const { error: e } = await supabase.from("character_spell_options").delete().eq("id", id).eq("character_id", characterId); if (e) return { ok: false, error: e.message }; setSpellOptions((c) => c.filter((x) => x.id !== id)); return { ok: true } }, [characterId])
  const learnSpell = useCallback(async (id: string): Promise<Result> => { const { error: e } = await supabase.rpc("learn_character_spell", { p_option_id: id }); return e ? { ok: false, error: e.message } : reloadSpellCollections() }, [reloadSpellCollections])
  const setSpellPrepared = useCallback(async (id: string, prepared: boolean): Promise<Result> => { const { error: e } = await supabase.rpc("set_character_spell_prepared", { p_spell_id: id, p_prepared: prepared }); if (e) return { ok: false, error: e.message }; setSpells((c) => c.map((x) => x.id === id ? { ...x, prepared, updated_at: new Date().toISOString() } : x)); return { ok: true } }, [])

  const addFeature = useCallback(async (input: FeatureInput): Promise<Result> => { const { data, error: e } = await supabase.from("character_features").insert({ character_id: characterId, ...input, mechanics: input.mechanics || [] }).select("*").single(); if (e) return { ok: false, error: e.message }; setFeatures((c) => sortFeatures([...c, data as CharacterFeature])); return { ok: true } }, [characterId])
  const updateFeature = useCallback(async (id: string, input: FeatureInput): Promise<Result> => { const { data, error: e } = await supabase.from("character_features").update({ ...input, mechanics: input.mechanics || [], updated_at: new Date().toISOString() }).eq("id", id).eq("character_id", characterId).select("*").single(); if (e) return { ok: false, error: e.message }; setFeatures((c) => sortFeatures(c.map((x) => x.id === id ? data as CharacterFeature : x))); return { ok: true } }, [characterId])
  const deleteFeature = useCallback(async (id: string): Promise<Result> => { const { error: e } = await supabase.from("character_features").delete().eq("id", id).eq("character_id", characterId); if (e) return { ok: false, error: e.message }; setFeatures((c) => c.filter((x) => x.id !== id)); return { ok: true } }, [characterId])

  const addDiaryPost = useCallback(async (body: string, mediaUrl: string | null = null): Promise<Result> => { const { data, error: e } = await supabase.from("character_diary_posts").insert({ character_id: characterId, created_by: user.id, body: body.trim(), media_url: mediaUrl }).select("*").single(); if (e) { if (mediaUrl) void deleteCampaignMediaObject(mediaUrl); return { ok: false, error: e.message } }; setPosts((c) => [data as DiaryPost, ...c]); return { ok: true } }, [characterId, user.id])
  const updateDiaryPost = useCallback(async (id: string, body: string): Promise<Result> => { const { data, error: e } = await supabase.from("character_diary_posts").update({ body: body.trim(), updated_at: new Date().toISOString() }).eq("id", id).eq("character_id", characterId).select("*").single(); if (e) return { ok: false, error: e.message }; setPosts((c) => c.map((x) => x.id === id ? data as DiaryPost : x)); return { ok: true } }, [characterId])
  const deleteDiaryPost = useCallback(async (id: string): Promise<Result> => { const target = posts.find((x) => x.id === id); const { error: e } = await supabase.from("character_diary_posts").delete().eq("id", id); if (e) return { ok: false, error: e.message }; setPosts((c) => c.filter((x) => x.id !== id)); setComments((c) => c.filter((x) => x.post_id !== id)); if (target?.media_url) void deleteCampaignMediaObject(target.media_url); return { ok: true } }, [posts])
  const addComment = useCallback(async (postId: string, body: string): Promise<Result> => { const { data, error: e } = await supabase.from("character_diary_comments").insert({ post_id: postId, created_by: user.id, body: body.trim() }).select("*").single(); if (e) return { ok: false, error: e.message }; setComments((c) => [...c, data as DiaryComment].sort((a, b) => a.created_at.localeCompare(b.created_at))); return { ok: true } }, [user.id])
  const deleteComment = useCallback(async (id: string): Promise<Result> => { const { error: e } = await supabase.from("character_diary_comments").delete().eq("id", id); if (e) return { ok: false, error: e.message }; setComments((c) => c.filter((x) => x.id !== id)); return { ok: true } }, [])
  const addArt = useCallback(async (title: string, imageUrl: string): Promise<Result> => { const { data, error: e } = await supabase.from("campaign_art_items").insert({ campaign_id: campaignId, uploaded_by: user.id, character_id: characterId, title: title.trim() || "Арт персонажа", image_url: imageUrl }).select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, created_at, updated_at").single(); if (e) { void deleteCampaignMediaObject(imageUrl); return { ok: false, error: e.message } }; setArts((c) => [data as CharacterArt, ...c]); return { ok: true } }, [campaignId, characterId, user.id])
  const updateArt = useCallback(async (id: string, title: string, caption: string): Promise<Result> => { const { data, error: e } = await supabase.from("campaign_art_items").update({ title: title.trim() || "Арт персонажа", caption: caption.trim(), updated_at: new Date().toISOString() }).eq("id", id).eq("character_id", characterId).select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, created_at, updated_at").single(); if (e) return { ok: false, error: e.message }; setArts((c) => c.map((x) => x.id === id ? data as CharacterArt : x)); return { ok: true } }, [characterId])
  const deleteArt = useCallback(async (id: string): Promise<Result> => { const target = arts.find((x) => x.id === id); const { error: e } = await supabase.from("campaign_art_items").delete().eq("id", id); if (e) return { ok: false, error: e.message }; setArts((c) => c.filter((x) => x.id !== id)); if (target?.image_url) void deleteCampaignMediaObject(target.image_url); return { ok: true } }, [arts])

  return { sheet, inventory, spells, spellOptions, features, posts, comments, arts, loading, error, reload: load, updateSheet, addInventoryItem, updateInventoryItem, deleteInventoryItem, setInventoryEquipped, setSpellcastingEnabled, addSpell, updateSpell, deleteSpell, addSpellOption, updateSpellOption, deleteSpellOption, learnSpell, setSpellPrepared, addFeature, updateFeature, deleteFeature, addDiaryPost, updateDiaryPost, deleteDiaryPost, addComment, deleteComment, addArt, updateArt, deleteArt }
}
