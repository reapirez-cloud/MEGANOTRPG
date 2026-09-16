export type CharacterSheetVisualAsset = {
  url: string
  columns: number
  rows: number
  column: number
  row: number
  render: "image" | "mask"
}

const CLASS_RESOURCE_ATLAS =
  "/ui-v1/character-sheet/icons/class-resources.png"
const CLASS_SPELL_SLOT_ATLAS =
  "/ui-v1/character-sheet/icons/class-spell-slots.png"

const FALLBACK_SPELL_SLOT_ATLAS =
  "/ui-v1/character-sheet/icons/spell-slots.png"
const FALLBACK_RESOURCE_ATLAS =
  "/ui-v1/character-sheet/icons/resources.png"

export const CHARACTER_SHEET_SPENT_CROSS_ASSET =
  "/ui-v1/character-sheet/icons/spent-resource-cross.png"

function atlasAsset(
  url: string,
  columns: number,
  rows: number,
  column: number,
  row: number,
  render: CharacterSheetVisualAsset["render"],
): CharacterSheetVisualAsset {
  return { url, columns, rows, column, row, render }
}

const classIcon = (
  url: string,
  index: number,
): CharacterSheetVisualAsset =>
  atlasAsset(
    url,
    4,
    4,
    index % 4,
    Math.floor(index / 4),
    "image",
  )

export const CHARACTER_SHEET_AUTHORED_CLASS_KEYS = [
  "fighter",
  "warlock",
  "cleric",
  "druid",
  "bard",
  "paladin",
  "sorcerer",
  "wizard",
  "rogue",
  "monk",
  "barbarian",
  "artificer",
  "ranger",
] as const

export const CHARACTER_SHEET_CLASS_RESOURCE_ASSETS: Readonly<
  Record<string, CharacterSheetVisualAsset>
> = Object.fromEntries(
  CHARACTER_SHEET_AUTHORED_CLASS_KEYS.map((classKey, index) => [
    classKey,
    classIcon(
      classKey === "druid" ? CLASS_SPELL_SLOT_ATLAS : CLASS_RESOURCE_ATLAS,
      index,
    ),
  ]),
)

export const CHARACTER_SHEET_CLASS_SPELL_SLOT_ASSETS: Readonly<
  Record<string, CharacterSheetVisualAsset>
> = Object.fromEntries(
  CHARACTER_SHEET_AUTHORED_CLASS_KEYS.map((classKey, index) => [
    classKey,
    classIcon(
      classKey === "druid" ? CLASS_RESOURCE_ATLAS : CLASS_SPELL_SLOT_ATLAS,
      index,
    ),
  ]),
)

const fallbackSpellSlot = (column: number, row: number) =>
  atlasAsset(
    FALLBACK_SPELL_SLOT_ATLAS,
    4,
    3,
    column,
    row,
    "mask",
  )

const fallbackResource = (column: number, row: number) =>
  atlasAsset(
    FALLBACK_RESOURCE_ATLAS,
    5,
    4,
    column,
    row,
    "mask",
  )

const FALLBACK_SPELL_SLOT_ASSET = fallbackSpellSlot(0, 0)

export const CHARACTER_SHEET_RESOURCE_ASSETS: Readonly<
  Record<string, CharacterSheetVisualAsset>
> = {
  generic: fallbackResource(0, 0),
  action_surge: fallbackResource(1, 0),
  bardic_inspiration: fallbackResource(2, 0),
  channel_divinity: fallbackResource(3, 0),
  innate_sorcery: fallbackResource(4, 0),

  monk_focus: fallbackResource(0, 1),
  monk_uncanny_metabolism: fallbackResource(1, 1),
  paladin_divine_sense: fallbackResource(2, 1),
  paladin_lay_on_hands: fallbackResource(3, 1),
  second_wind: fallbackResource(4, 1),

  sorcerous_restoration: fallbackResource(0, 2),
  sorcery_points: fallbackResource(1, 2),
  warlock_contact_patron: fallbackResource(2, 2),
  warlock_magical_cunning: fallbackResource(3, 2),
  wild_shape: fallbackResource(4, 2),

  wizard_arcane_recovery: fallbackResource(0, 3),
  wizard_chronurgy: fallbackResource(1, 3),
  warlock_mystic_arcanum: fallbackResource(2, 3),
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

export function characterSheetClassResourceAsset(classKey: string) {
  return (
    CHARACTER_SHEET_CLASS_RESOURCE_ASSETS[classKey] ||
    CHARACTER_SHEET_RESOURCE_ASSETS.generic
  )
}

export function characterSheetSpellSlotAsset(classKey: string) {
  return (
    CHARACTER_SHEET_CLASS_SPELL_SLOT_ASSETS[classKey] ||
    FALLBACK_SPELL_SLOT_ASSET
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

  const classResourceMatch = slot.match(/^class:([^:]+):resource$/)
  if (classResourceMatch?.[1]) {
    return characterSheetClassResourceAsset(classResourceMatch[1])
  }

  if (slot.startsWith("resource:")) {
    return characterSheetResourceAsset(slot.slice("resource:".length))
  }

  return null
}
