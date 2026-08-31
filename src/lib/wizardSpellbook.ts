import { supabase } from "./supabase.ts"

export type WizardSpellbookBook = {
  itemId: string
  name: string
  definitionId: string | null
  definitionRevision: number | null
}

export type WizardSpellbookSpell = {
  bookItemId: string
  bookName: string
  spellCatalogId: string
  characterSpellId: string | null
  name: string
  nameEn: string
  level: number
  school: string
  ritual: boolean
}

export type WizardSpellbookState = {
  hasBook: boolean
  wizardLevel: number | null
  maxSpellLevel: number | null
  books: WizardSpellbookBook[]
  spells: WizardSpellbookSpell[]
}

export type WizardSpellbookOption = {
  id: string
  name: string
  nameEn: string
  level: number
  school: string
  ritual: boolean
}

const EMPTY: WizardSpellbookState = {
  hasBook: false,
  wizardLevel: null,
  maxSpellLevel: null,
  books: [],
  spells: [],
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function nullableText(value: unknown) {
  const valueText = text(value).trim()
  return valueText || null
}

function nullableInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

export function normalizeWizardSpellbookState(value: unknown): WizardSpellbookState {
  const root = record(value)
  const books = Array.isArray(root.books) ? root.books.map(record).map((book) => ({
    itemId: text(book.itemId),
    name: text(book.name) || "Книга заклинаний",
    definitionId: nullableText(book.definitionId),
    definitionRevision: nullableInteger(book.definitionRevision),
  })).filter((book) => Boolean(book.itemId)) : []
  const spells = Array.isArray(root.spells) ? root.spells.map(record).map((spell) => ({
    bookItemId: text(spell.bookItemId),
    bookName: text(spell.bookName) || "Книга заклинаний",
    spellCatalogId: text(spell.spellCatalogId),
    characterSpellId: nullableText(spell.characterSpellId),
    name: text(spell.name),
    nameEn: text(spell.nameEn),
    level: nullableInteger(spell.level) ?? 0,
    school: text(spell.school),
    ritual: spell.ritual === true,
  })).filter((spell) => Boolean(spell.bookItemId && spell.spellCatalogId)) : []
  return {
    hasBook: root.hasBook === true && books.length > 0,
    wizardLevel: nullableInteger(root.wizardLevel),
    maxSpellLevel: nullableInteger(root.maxSpellLevel),
    books,
    spells,
  }
}

export async function loadWizardSpellbook(characterId: string): Promise<WizardSpellbookState> {
  if (!characterId) return EMPTY
  const { data, error } = await supabase.rpc("get_character_wizard_spellbook_v1", { p_character_id: characterId })
  if (error) throw error
  return normalizeWizardSpellbookState(data)
}

export async function loadWizardSpellbookOptions(maxSpellLevel: number): Promise<WizardSpellbookOption[]> {
  if (!Number.isInteger(maxSpellLevel) || maxSpellLevel < 1) return []
  const { data: links, error: linksError } = await supabase
    .from("spell_catalog_classes")
    .select("spell_id")
    .eq("class_key", "wizard")
  if (linksError) throw linksError
  const ids = [...new Set((links || []).map((row) => String(row.spell_id || "")).filter(Boolean))]
  if (!ids.length) return []

  const { data, error } = await supabase
    .from("spell_catalog")
    .select("id,name_ru,name_en,spell_level,school,ritual")
    .in("id", ids)
    .gt("spell_level", 0)
    .lte("spell_level", maxSpellLevel)
    .order("spell_level", { ascending: true })
    .order("name_en", { ascending: true })
  if (error) throw error

  return (data || []).map((spell) => ({
    id: String(spell.id),
    name: String(spell.name_ru || spell.name_en || "Заклинание"),
    nameEn: String(spell.name_en || ""),
    level: Number(spell.spell_level || 0),
    school: String(spell.school || ""),
    ritual: spell.ritual === true,
  }))
}

export async function grantWizardSpellbookSpell(characterId: string, spellCatalogId: string, spellbookItemId?: string | null) {
  const { data, error } = await supabase.rpc("grant_character_wizard_spellbook_spell_v1", {
    p_character_id: characterId,
    p_spell_catalog_id: spellCatalogId,
    p_spellbook_item_id: spellbookItemId || null,
  })
  if (error) throw error
  return String(data || "")
}
