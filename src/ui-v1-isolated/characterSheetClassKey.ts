export const CHARACTER_SHEET_CANONICAL_CLASS_KEYS = [
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

const CLASS_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["воин", "fighter"], ["fighter", "fighter"],
  ["колдун", "warlock"], ["warlock", "warlock"],
  ["жрец", "cleric"], ["cleric", "cleric"],
  ["друид", "druid"], ["druid", "druid"],
  ["бард", "bard"], ["bard", "bard"],
  ["паладин", "paladin"], ["paladin", "paladin"],
  ["чарод", "sorcerer"], ["sorcer", "sorcerer"],
  ["волшеб", "wizard"], ["wizard", "wizard"],
  ["разбой", "rogue"], ["rogue", "rogue"],
  ["монах", "monk"], ["monk", "monk"],
  ["варвар", "barbarian"], ["barbarian", "barbarian"],
  ["артиф", "artificer"], ["artificer", "artificer"],
  ["следоп", "ranger"], ["рейндж", "ranger"], ["ranger", "ranger"],
]

export function normalizeCharacterSheetClassKey(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")

  if (!normalized) return "default"

  const catalogMatch = normalized.match(/^class:([^:]+)$/)
  const source = catalogMatch?.[1] || normalized

  const direct = CHARACTER_SHEET_CANONICAL_CLASS_KEYS.find(
    (classKey) =>
      source === classKey ||
      source.startsWith(classKey + "-") ||
      source.startsWith(classKey + "_"),
  )
  if (direct) return direct

  return CLASS_ALIASES.find(([needle]) => source.includes(needle))?.[1] || "default"
}

export function resolveCharacterSheetClassKey(input: {
  characterClass?: string | null
  assignedClass?: {
    slug?: string | null
    catalog_key?: string | null
  } | null
}) {
  const candidates = [
    input.assignedClass?.catalog_key,
    input.assignedClass?.slug,
    input.characterClass,
  ]

  for (const candidate of candidates) {
    const resolved = normalizeCharacterSheetClassKey(candidate)
    if (resolved !== "default") return resolved
  }

  return "default"
}
