export type CharacterSheetVisualAsset = {
  url: string
  columns: number
  rows: number
  column: number
  row: number
}

const SPELL_SLOT_ATLAS =
  "/ui-v1/character-sheet/icons/spell-slots.png"
const RESOURCE_ATLAS =
  "/ui-v1/character-sheet/icons/resources.png"

function atlasAsset(
  url: string,
  columns: number,
  rows: number,
  column: number,
  row: number,
): CharacterSheetVisualAsset {
  return { url, columns, rows, column, row }
}

const spellSlot = (column: number, row: number) =>
  atlasAsset(SPELL_SLOT_ATLAS, 4, 3, column, row)

const resource = (column: number, row: number) =>
  atlasAsset(RESOURCE_ATLAS, 5, 4, column, row)

export const CHARACTER_SHEET_SPELL_SLOT_ASSETS: Readonly<
  Record<string, CharacterSheetVisualAsset>
> = {
  default: spellSlot(0, 0),
  fighter: spellSlot(1, 0),
  warlock: spellSlot(2, 0),
  cleric: spellSlot(3, 0),
  druid: spellSlot(0, 1),
  bard: spellSlot(1, 1),
  paladin: spellSlot(2, 1),
  sorcerer: spellSlot(3, 1),
  wizard: spellSlot(0, 2),
  rogue: spellSlot(1, 2),
  monk: spellSlot(2, 2),
}

export const CHARACTER_SHEET_RESOURCE_ASSETS: Readonly<
  Record<string, CharacterSheetVisualAsset>
> = {
  generic: resource(0, 0),
  action_surge: resource(1, 0),
  bardic_inspiration: resource(2, 0),
  channel_divinity: resource(3, 0),
  innate_sorcery: resource(4, 0),

  monk_focus: resource(0, 1),
  monk_uncanny_metabolism: resource(1, 1),
  paladin_divine_sense: resource(2, 1),
  paladin_lay_on_hands: resource(3, 1),
  second_wind: resource(4, 1),

  sorcerous_restoration: resource(0, 2),
  sorcery_points: resource(1, 2),
  warlock_contact_patron: resource(2, 2),
  warlock_magical_cunning: resource(3, 2),
  wild_shape: resource(4, 2),

  wizard_arcane_recovery: resource(0, 3),
  wizard_chronurgy: resource(1, 3),
  warlock_mystic_arcanum: resource(2, 3),
}

const RESOURCE_PREFIX_ASSETS: ReadonlyArray<
  readonly [string, CharacterSheetVisualAsset]
> = [
  [
    "wizard_chronurgy_",
    CHARACTER_SHEET_RESOURCE_ASSETS.wizard_chronurgy,
  ],
  [
    "warlock_mystic_arcanum_",
    CHARACTER_SHEET_RESOURCE_ASSETS.warlock_mystic_arcanum,
  ],
]

export function characterSheetSpellSlotAsset(classKey: string) {
  return (
    CHARACTER_SHEET_SPELL_SLOT_ASSETS[classKey] ||
    CHARACTER_SHEET_SPELL_SLOT_ASSETS.default
  )
}

export function characterSheetResourceAsset(stateKey: string) {
  const exact = CHARACTER_SHEET_RESOURCE_ASSETS[stateKey]
  if (exact) return exact

  const prefix = RESOURCE_PREFIX_ASSETS.find(([needle]) =>
    stateKey.startsWith(needle)
  )

  return prefix?.[1] || CHARACTER_SHEET_RESOURCE_ASSETS.generic
}

export function characterSheetVisualAssetForSlot(slot: string) {
  const spellMatch = slot.match(/^class:([^:]+):spell_slot$/)
  if (spellMatch?.[1]) {
    return characterSheetSpellSlotAsset(spellMatch[1])
  }

  if (slot.startsWith("resource:")) {
    return characterSheetResourceAsset(slot.slice("resource:".length))
  }

  return null
}
