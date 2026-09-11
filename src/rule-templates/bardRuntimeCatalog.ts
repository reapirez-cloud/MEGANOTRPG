export const BARD_RUNTIME_CATALOG_KEYS = [
  "subclass:bard:dance",
  "subclass:bard:glamour",
  "subclass:bard:lore",
  "subclass:bard:valor",
  "subclass:bard:eloquence",
  "subclass:bard:swords",
  "subclass:bard:whispers",
  "subclass:bard:creation",
  "subclass:bard:spirits",
] as const

export const BARD_REFERENCE_ONLY_CATALOG_KEYS = [
  "subclass:bard:tragedy",
] as const

export const BARD_RUNTIME_REFERENCE_SUBCLASS_IDS = BARD_RUNTIME_CATALOG_KEYS.map((catalogKey) =>
  catalogKey.replace("subclass:bard:", ""),
)
