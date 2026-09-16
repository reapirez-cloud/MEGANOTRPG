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

export const CHARACTER_SHEET_SECTIONS = [
  "overview",
  "features",
  "spells",
  "biography",
] as const

export type CharacterSheetSection = typeof CHARACTER_SHEET_SECTIONS[number]

export function isCharacterSheetSection(value: unknown): value is CharacterSheetSection {
  return typeof value === "string" &&
    CHARACTER_SHEET_SECTIONS.includes(value as CharacterSheetSection)
}

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

export function characterSheetNavigationIconSlot(id: string) {
  return `sheet:nav:${id}`
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
    iconSlot: characterSheetNavigationIconSlot("inventory"),
    target: { kind: "interface", interface: "inventory" },
  },
  {
    id: "features",
    label: "Умения",
    iconSlot: characterSheetNavigationIconSlot("features"),
    target: { kind: "section", section: "features" },
  },
  {
    id: "spells",
    label: "Заклинания",
    iconSlot: characterSheetNavigationIconSlot("spells"),
    target: { kind: "section", section: "spells" },
  },
  {
    id: "biography",
    label: "Биография",
    iconSlot: characterSheetNavigationIconSlot("biography"),
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

export const CHARACTER_SHEET_SPELL_VISUAL_CONTRACT = {
  accentCssVar: "--cv-spell-accent",
  softAccentCssVar: "--cv-spell-accent-soft",
  slotMediaSlot: (classKey: string) => `class:${classKey}:spell_slot`,
} as const

export const CHARACTER_SHEET_CLASS_SKIN_CONTRACT = {
  scope: "class",
  layoutPolicy: "shared-layout",
  fallbackClassKey: "default",
  background: {
    mediaSlot: (classKey: string) =>
      `class:${classKey}:sheet_background`,
    role: "decorative-underlay",
    mustPreserveReadability: true,
  },
  paletteCssVars: [
    "--cv-canvas",
    "--cv-canvas-raised",
    "--cv-surface",
    "--cv-surface-soft",
    "--cv-text",
    "--cv-text-soft",
    "--cv-text-muted",
    "--cv-accent",
    "--cv-accent-soft",
    "--cv-accent-line",
    "--cv-spell-accent",
    "--cv-spell-accent-soft",
    "--cv-resource-accent",
  ],
  rules: {
    oneSkinPerClass: true,
    subclassDoesNotChangeLayout: true,
    backgroundNeverOwnsInteraction: true,
    backgroundMustRemainBehindUi: true,
    graphiteFallbackRequired: true,
  },
} as const

export const CHARACTER_SHEET_MEDIA_SLOTS = {
  portrait: "sheet:portrait",
  navigationIcon: characterSheetNavigationIconSlot,
  quickStats: {
    armorClass: "sheet:quick:armor_class",
    passivePerception: "sheet:quick:passive_perception",
    proficiency: "sheet:quick:proficiency",
    initiative: "sheet:quick:initiative",
    speed: "sheet:quick:speed",
    spellSaveDc: "sheet:quick:spell_save_dc",
    spellAttack: "sheet:quick:spell_attack",
  },
  spellSlot: CHARACTER_SHEET_SPELL_VISUAL_CONTRACT.slotMediaSlot,
  classSheetBackground:
    CHARACTER_SHEET_CLASS_SKIN_CONTRACT.background.mediaSlot,
  resource: (stateKey: string) => `resource:${stateKey}`,
} as const

export const CHARACTER_SHEET_SNAKE_CONTEXT_KEYS = [
  "characterId",
  "section",
  "interfaceMode",
  "expandedAbility",
  "selectedFeatureId",
  "selectedSpellId",
  "selectedResourceKey",
  "selectedEffectId",
  "focusedItemId",
  "spellFocusLevel",
  "inventoryHolderId",
  "authorityRole",
  "canManage",
  "canControlCharacter",
  "isOwner",
  "assignedToCurrentUser",
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
