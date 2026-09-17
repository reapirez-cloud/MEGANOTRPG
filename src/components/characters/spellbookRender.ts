import type { ResolvedResource } from "../../character-engine/index.ts"
import type { CharacterSpell } from "../../types/characterSheet.ts"
import { spellSlotResources } from "./spellSlots.ts"

export type SpellbookMode = "prepared" | "known"

export const SPELLBOOK_CANTRIP_PREVIEW_LIMIT = 4

export type SpellbookSlotCell = {
  index: number
  filled: boolean
}

export type SpellbookSlotLevel = {
  level: number
  available: boolean
  current: number
  maximum: number
  depleted: boolean
  cells: SpellbookSlotCell[]
}

export type SpellbookCantripProjection = {
  count: number
  expanded: boolean
  previewSpells: CharacterSpell[]
  visibleSpells: CharacterSpell[]
  hiddenCount: number
}

export type SpellbookLevelSection = {
  level: number
  expanded: boolean
  spellCount: number
  knownCount: number
  preparedCount: number
  spells: CharacterSpell[]
  slot: SpellbookSlotLevel
}

export type SpellbookRenderModel = {
  preparedCount: number
  knownCount: number
  levels: number[]
  slotLevels: number[]
  slotRail: SpellbookSlotLevel[]
  cantrips: SpellbookCantripProjection
  levelSections: SpellbookLevelSection[]
  visibleSpells: CharacterSpell[]
  visibleLeveledSpells: CharacterSpell[]
}

type BuildSpellbookRenderModelInput = {
  resources: ResolvedResource[]
  spells: CharacterSpell[]
  mode: SpellbookMode
  selectedLevel: number | null
}

/**
 * Pure render projection for the spell tab.
 *
 * Keep UI components dumb: the same resolved resources drive the slot panel,
 * cantrip section, level accordions and spell list so a visual redesign cannot
 * quietly invent a second interpretation of character state.
 */
export function buildSpellbookRenderModel({
  resources,
  spells,
  mode,
  selectedLevel,
}: BuildSpellbookRenderModelInput): SpellbookRenderModel {
  const slots = spellSlotResources(resources)
  const levelSet = new Set<number>()

  for (const spell of spells) levelSet.add(spell.spell_level)
  for (const slot of slots) levelSet.add(slot.level)

  const slotByLevel = new Map(slots.map(({ resource, level }) => {
    const maximum = Math.max(0, Math.round(resource.max.value))
    const current = Math.max(0, Math.min(maximum, Math.round(resource.current)))
    return [level, { current, maximum }] as const
  }))

  const slotRail: SpellbookSlotLevel[] = Array.from({ length: 9 }, (_, index) => {
    const level = index + 1
    const slot = slotByLevel.get(level)
    const maximum = slot?.maximum ?? 0
    const current = slot?.current ?? 0
    const available = Boolean(slot)

    return {
      level,
      available,
      current,
      maximum,
      depleted: available && maximum > 0 && current === 0,
      cells: Array.from({ length: maximum }, (_, cellIndex) => ({
        index: cellIndex,
        filled: cellIndex < current,
      })),
    }
  })

  const preparedCount = spells.reduce(
    (count, spell) => count + (spell.prepared ? 1 : 0),
    0,
  )

  const modeSpells = spells.filter((spell) => mode !== "prepared" || spell.prepared)
  const cantripSpells = modeSpells.filter((spell) => spell.spell_level === 0)
  const cantripExpanded = selectedLevel === 0
  const cantripPreview = cantripSpells.slice(0, SPELLBOOK_CANTRIP_PREVIEW_LIMIT)
  const cantripVisible = selectedLevel === null
    ? cantripPreview
    : cantripExpanded
      ? cantripSpells
      : []

  const knownLeveledByLevel = new Map<number, CharacterSpell[]>()
  const modeLeveledByLevel = new Map<number, CharacterSpell[]>()

  for (const spell of spells) {
    if (spell.spell_level <= 0) continue
    const bucket = knownLeveledByLevel.get(spell.spell_level) ?? []
    bucket.push(spell)
    knownLeveledByLevel.set(spell.spell_level, bucket)
  }

  for (const spell of modeSpells) {
    if (spell.spell_level <= 0) continue
    const bucket = modeLeveledByLevel.get(spell.spell_level) ?? []
    bucket.push(spell)
    modeLeveledByLevel.set(spell.spell_level, bucket)
  }

  const levelSections: SpellbookLevelSection[] = slotRail
    .map((slot) => {
      const knownSpells = knownLeveledByLevel.get(slot.level) ?? []
      const sectionSpells = modeLeveledByLevel.get(slot.level) ?? []
      const prepared = knownSpells.reduce((count, spell) => count + (spell.prepared ? 1 : 0), 0)
      return {
        level: slot.level,
        expanded: selectedLevel === slot.level,
        spellCount: sectionSpells.length,
        knownCount: knownSpells.length,
        preparedCount: prepared,
        spells: sectionSpells,
        slot,
      }
    })
    .filter((section) => section.slot.available || section.knownCount > 0)

  const visibleSpells = modeSpells.filter((spell) =>
    selectedLevel === null || spell.spell_level === selectedLevel,
  )
  const visibleLeveledSpells = visibleSpells.filter((spell) => spell.spell_level > 0)

  return {
    preparedCount,
    knownCount: spells.length,
    levels: [...levelSet].sort((left, right) => left - right),
    slotLevels: slots.map((slot) => slot.level),
    slotRail,
    cantrips: {
      count: cantripSpells.length,
      expanded: cantripExpanded,
      previewSpells: cantripPreview,
      visibleSpells: cantripVisible,
      hiddenCount: Math.max(0, cantripSpells.length - cantripPreview.length),
    },
    levelSections,
    visibleSpells,
    visibleLeveledSpells,
  }
}
