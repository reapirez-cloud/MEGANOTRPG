import type { ResolvedResource } from "../../character-engine/index.ts"
import type { CharacterSpell } from "../../types/characterSheet.ts"
import { spellSlotResources } from "./spellSlots.ts"

export type SpellbookMode = "prepared" | "known"

export type SpellbookSlotLevel = {
  level: number
  available: boolean
  current: number
  maximum: number
}

export type SpellbookRenderModel = {
  preparedCount: number
  knownCount: number
  levels: number[]
  slotLevels: number[]
  slotRail: SpellbookSlotLevel[]
  visibleSpells: CharacterSpell[]
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
 * Keep UI components dumb: the same resolved resources drive the slot meter,
 * level filters and spell list so a visual redesign cannot quietly invent a
 * second interpretation of character state.
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
    return {
      level,
      available: Boolean(slot),
      current: slot?.current ?? 0,
      maximum: slot?.maximum ?? 0,
    }
  })

  const preparedCount = spells.reduce(
    (count, spell) => count + (spell.prepared ? 1 : 0),
    0,
  )

  const visibleSpells = spells.filter((spell) =>
    (mode !== "prepared" || spell.prepared) &&
    (selectedLevel === null || spell.spell_level === selectedLevel),
  )

  return {
    preparedCount,
    knownCount: spells.length,
    levels: [...levelSet].sort((left, right) => left - right),
    slotLevels: slots.map((slot) => slot.level),
    slotRail,
    visibleSpells,
  }
}
