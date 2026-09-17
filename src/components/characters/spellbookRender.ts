import type { ResolvedResource } from "../../character-engine/index.ts"
import type { CharacterSpell } from "../../types/characterSheet.ts"
import { spellSlotResources } from "./spellSlots.ts"

export type SpellbookMode = "prepared" | "known"

export type SpellbookRenderModel = {
  preparedCount: number
  knownCount: number
  levels: number[]
  slotLevels: number[]
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
    visibleSpells,
  }
}
