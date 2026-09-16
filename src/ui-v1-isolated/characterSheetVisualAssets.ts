export const CHARACTER_SHEET_ASSET_ROOT =
  "/ui-v1/character-sheet/icons"

export const CHARACTER_SHEET_SPELL_SLOT_ASSETS: Readonly<Record<string, string>> = {
  default: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/default.png",
  fighter: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/fighter.png",
  warlock: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/warlock.png",
  cleric: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/cleric.png",
  druid: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/druid.png",
  bard: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/bard.png",
  paladin: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/paladin.png",
  sorcerer: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/sorcerer.png",
  wizard: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/wizard.png",
  rogue: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/rogue.png",
  monk: CHARACTER_SHEET_ASSET_ROOT + "/spell-slots/monk.png",
}

export const CHARACTER_SHEET_RESOURCE_ASSETS: Readonly<Record<string, string>> = {
  action_surge: CHARACTER_SHEET_ASSET_ROOT + "/resources/action_surge.png",
  bardic_inspiration:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/bardic_inspiration.png",
  channel_divinity:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/channel_divinity.png",
  innate_sorcery:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/innate_sorcery.png",
  monk_focus: CHARACTER_SHEET_ASSET_ROOT + "/resources/monk_focus.png",
  monk_uncanny_metabolism:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/monk_uncanny_metabolism.png",
  paladin_divine_sense:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/paladin_divine_sense.png",
  paladin_lay_on_hands:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/paladin_lay_on_hands.png",
  second_wind: CHARACTER_SHEET_ASSET_ROOT + "/resources/second_wind.png",
  sorcerous_restoration:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/sorcerous_restoration.png",
  sorcery_points:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/sorcery_points.png",
  warlock_contact_patron:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/warlock_contact_patron.png",
  warlock_magical_cunning:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/warlock_magical_cunning.png",
  wild_shape: CHARACTER_SHEET_ASSET_ROOT + "/resources/wild_shape.png",
  wizard_arcane_recovery:
    CHARACTER_SHEET_ASSET_ROOT + "/resources/wizard_arcane_recovery.png",
}

const RESOURCE_PREFIX_ASSETS: ReadonlyArray<readonly [string, string]> = [
  [
    "wizard_chronurgy_",
    CHARACTER_SHEET_ASSET_ROOT + "/resources/wizard_chronurgy.png",
  ],
  [
    "warlock_mystic_arcanum_",
    CHARACTER_SHEET_ASSET_ROOT + "/resources/warlock_mystic_arcanum.png",
  ],
]

export const CHARACTER_SHEET_GENERIC_RESOURCE_ASSET =
  CHARACTER_SHEET_ASSET_ROOT + "/resources/generic.png"

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
  return prefix?.[1] || CHARACTER_SHEET_GENERIC_RESOURCE_ASSET
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
