export type CharacterProficiencyClassCoverageStatus =
  | "certified"
  | "mechanics_pending"

export type CharacterProficiencyClassCoverageEntry = {
  catalogKey: `class:${string}`
  name: string
  nameEn: string
  status: CharacterProficiencyClassCoverageStatus
  expectedKeys: readonly string[]
  source: string
  note?: string
}

export const CHARACTER_PROFICIENCY_CLASS_COVERAGE = [
  {
    catalogKey: "class:artificer",
    name: "Артифисер",
    nameEn: "Artificer",
    status: "mechanics_pending",
    expectedKeys: [],
    source: "future class runtime",
    note: "Механики класса ещё не подключены; Stage 5 резервирует только стабильную identity.",
  },
  {
    catalogKey: "class:barbarian",
    name: "Варвар",
    nameEn: "Barbarian",
    status: "mechanics_pending",
    expectedKeys: [],
    source: "future class runtime",
    note: "Механики класса ещё не подключены; Stage 5 резервирует только стабильную identity.",
  },
  {
    catalogKey: "class:bard",
    name: "Бард",
    nameEn: "Bard",
    status: "certified",
    expectedKeys: [
      "weapon:simple",
      "armor:light",
      "savingThrow:dexterity",
      "savingThrow:charisma",
    ],
    source: "class:bard runtime + persistent instrument choices",
  },
  {
    catalogKey: "class:cleric",
    name: "Жрец",
    nameEn: "Cleric",
    status: "certified",
    expectedKeys: [
      "weapon:simple",
      "armor:light",
      "armor:medium",
      "armor:shield",
      "savingThrow:wisdom",
      "savingThrow:charisma",
    ],
    source: "class:cleric runtime + Divine Order choices",
  },
  {
    catalogKey: "class:druid",
    name: "Друид",
    nameEn: "Druid",
    status: "certified",
    expectedKeys: [
      "weapon:simple",
      "armor:light",
      "armor:shield",
      "tool:herbalism-kit",
      "druidic",
      "savingThrow:intelligence",
      "savingThrow:wisdom",
    ],
    source: "class:druid runtime + Primal Order choices",
  },
  {
    catalogKey: "class:fighter",
    name: "Воин",
    nameEn: "Fighter",
    status: "certified",
    expectedKeys: [
      "weapon:simple",
      "weapon:martial",
      "armor:light",
      "armor:medium",
      "armor:heavy",
      "armor:shield",
      "savingThrow:strength",
      "savingThrow:constitution",
    ],
    source: "class:fighter runtime",
  },
  {
    catalogKey: "class:monk",
    name: "Монах",
    nameEn: "Monk",
    status: "certified",
    expectedKeys: [
      "weapon:simple",
      "weapon:martial-light",
      "savingThrow:strength",
      "savingThrow:dexterity",
    ],
    source: "class:monk rules_meta.core_traits + Stage 5 baseline migration",
  },
  {
    catalogKey: "class:paladin",
    name: "Паладин",
    nameEn: "Paladin",
    status: "certified",
    expectedKeys: [
      "weapon:simple",
      "weapon:martial",
      "armor:light",
      "armor:medium",
      "armor:heavy",
      "armor:shield",
      "savingThrow:wisdom",
      "savingThrow:charisma",
    ],
    source: "class:paladin runtime",
  },
  {
    catalogKey: "class:ranger",
    name: "Следопыт",
    nameEn: "Ranger",
    status: "mechanics_pending",
    expectedKeys: [],
    source: "future class runtime",
    note: "Механики класса ещё не подключены; Stage 5 резервирует только стабильную identity.",
  },
  {
    catalogKey: "class:rogue",
    name: "Разбойник",
    nameEn: "Rogue",
    status: "mechanics_pending",
    expectedKeys: [],
    source: "src/data/classes/rogueRuntimePlan.md",
    note: "Текст готов, но CE runtime класса ещё не создан.",
  },
  {
    catalogKey: "class:sorcerer",
    name: "Чародей",
    nameEn: "Sorcerer",
    status: "certified",
    expectedKeys: [
      "weapon:simple",
      "savingThrow:constitution",
      "savingThrow:charisma",
    ],
    source: "class:sorcerer runtime",
  },
  {
    catalogKey: "class:warlock",
    name: "Колдун",
    nameEn: "Warlock",
    status: "certified",
    expectedKeys: [
      "weapon:simple",
      "armor:light",
      "savingThrow:wisdom",
      "savingThrow:charisma",
    ],
    source: "class:warlock rules_meta.core_traits + Stage 5 baseline migration",
  },
  {
    catalogKey: "class:wizard",
    name: "Волшебник",
    nameEn: "Wizard",
    status: "certified",
    expectedKeys: [
      "weapon:simple",
      "savingThrow:intelligence",
      "savingThrow:wisdom",
    ],
    source: "class:wizard runtime",
  },
] as const satisfies readonly CharacterProficiencyClassCoverageEntry[]

export const CHARACTER_PROFICIENCY_PENDING_CLASS_KEYS =
  CHARACTER_PROFICIENCY_CLASS_COVERAGE
    .filter((entry) => entry.status === "mechanics_pending")
    .map((entry) => entry.catalogKey)

export function characterProficiencyClassCoverage(
  catalogKey: string,
): CharacterProficiencyClassCoverageEntry | null {
  return CHARACTER_PROFICIENCY_CLASS_COVERAGE.find(
    (entry) => entry.catalogKey === catalogKey,
  ) || null
}
