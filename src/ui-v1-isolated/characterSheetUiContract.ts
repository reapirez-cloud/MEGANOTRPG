/**
 * Character sheet UI contract.
 *
 * This is the executable map for the redesign. Components should consume these
 * concepts instead of inventing ad-hoc navigation, sorting or media-slot names.
 *
 * IMPORTANT PRODUCT RULES
 * - Inventory is a full interface, not a CharacterSheetSection.
 * - Everything else switches the content area under the persistent sheet shell.
 * - Normal tap performs the primary action/navigation.
 * - Long press is reserved for Snake contextual actions.
 * - Lists are grouped and sorted; no flat "everything in one pile" screens.
 */

export type CharacterSheetSection =
  | "overview"
  | "features"
  | "spells"
  | "biography"

export type CharacterSheetInterface = "inventory"

export type CharacterSheetTarget =
  | { kind: "section"; section: CharacterSheetSection }
  | { kind: "interface"; interface: CharacterSheetInterface }

export type CharacterSheetNavItem = {
  id: string
  label: string
  iconSlot: string
  target: CharacterSheetTarget
}

/**
 * Append future sheet entries here.
 *
 * The shell intentionally does not derive its height from this array: the rail
 * is a fixed-height internal scroller. Adding more entries must never make the
 * masthead taller or push the 50/50 core block down the page.
 */
export const CHARACTER_SHEET_NAVIGATION: readonly CharacterSheetNavItem[] = [
  {
    id: "inventory",
    label: "Инвентарь",
    iconSlot: "sheet:nav:inventory",
    target: { kind: "interface", interface: "inventory" },
  },
  {
    id: "features",
    label: "Умения",
    iconSlot: "sheet:nav:features",
    target: { kind: "section", section: "features" },
  },
  {
    id: "spells",
    label: "Заклинания",
    iconSlot: "sheet:nav:spells",
    target: { kind: "section", section: "spells" },
  },
  {
    id: "biography",
    label: "Биография",
    iconSlot: "sheet:nav:biography",
    target: { kind: "section", section: "biography" },
  },
] as const

export const CHARACTER_SHEET_FEATURE_SOURCE_ORDER = [
  "class",
  "subclass",
  "race",
  "background",
  "item",
  "effect",
  "other",
] as const

export const CHARACTER_SHEET_FEATURE_TIMING_ORDER = [
  "action",
  "bonus_action",
  "reaction",
  "passive",
  "other",
] as const

export const CHARACTER_SHEET_SPELL_GROUP_ORDER = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
] as const

export const CHARACTER_SHEET_SORTING_CONTRACT = {
  features: {
    groupBy: "source",
    sourceOrder: CHARACTER_SHEET_FEATURE_SOURCE_ORDER,
    withinSource: ["timing", "unlockLevel", "name"],
    timingOrder: CHARACTER_SHEET_FEATURE_TIMING_ORDER,
    fallbackSource: "other",
  },
  spells: {
    groupBy: "spellLevel",
    levelOrder: CHARACTER_SHEET_SPELL_GROUP_ORDER,
    cantripLevel: 0,
    withinLevel: ["preparedFirstWhenRelevant", "name"],
  },
} as const

export const CHARACTER_SHEET_MEDIA_SLOTS = {
  portrait: "sheet:portrait",
  navigation: {
    inventory: "sheet:nav:inventory",
    features: "sheet:nav:features",
    spells: "sheet:nav:spells",
    biography: "sheet:nav:biography",
  },
  quickStats: {
    armorClass: "sheet:quick:armor_class",
    passivePerception: "sheet:quick:passive_perception",
    proficiency: "sheet:quick:proficiency",
    initiative: "sheet:quick:initiative",
    speed: "sheet:quick:speed",
    spellSaveDc: "sheet:quick:spell_save_dc",
    spellAttack: "sheet:quick:spell_attack",
  },
  spellSlot: (classKey: string) => `class:${classKey}:spell_slot`,
  resource: (stateKey: string) => `resource:${stateKey}`,
} as const

export const CHARACTER_SHEET_SNAKE_CONTEXT_KEYS = [
  "characterId",
  "section",
  "expandedAbility",
  "selectedFeatureId",
  "selectedSpellId",
  "selectedResourceKey",
  "inventoryHolderId",
] as const

export const CHARACTER_SHEET_INTERACTION_CONTRACT = {
  inventory: "open-full-interface",
  sectionTap: "replace-dynamic-content",
  backFromSection: "return-to-overview",
  backFromOverview: "leave-character-sheet",
  entityTap: "primary-action-or-detail",
  entityLongPress: "open-snake-context",
  spellSlotTap: "open-spells-and-focus-level",
  resourceTap: "open-resource-detail-or-linked-feature-group",
} as const
