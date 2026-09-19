import type { AbilityKey } from "../character-engine/index.ts"

export const CHARACTER_PROFICIENCY_GROUP_ORDER = [
  "weapons",
  "armor",
  "tools",
  "languages",
  "saving_throws",
] as const

export type CharacterProficiencyGroupKey =
  typeof CHARACTER_PROFICIENCY_GROUP_ORDER[number]

export type CharacterProficiencyCatalogMode = "closed" | "open"

export type CharacterProficiencyCatalogEntry = {
  key: string
  label: string
}

export type CharacterProficiencyGroupContract = {
  key: CharacterProficiencyGroupKey
  label: string
  description: string
  iconSlot: string
  catalogMode: CharacterProficiencyCatalogMode
  entries: readonly CharacterProficiencyCatalogEntry[]
}

export const CHARACTER_PROFICIENCY_SAVING_THROW_ABILITIES: readonly AbilityKey[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const

export const CHARACTER_PROFICIENCY_GROUPS = {
  weapons: {
    key: "weapons",
    label: "Оружие",
    description: "Ты знаешь, как обращаться со следующим оружием:",
    iconSlot: "sheet:proficiencies:weapons",
    catalogMode: "open",
    entries: [
      { key: "weapon:simple", label: "Простое оружие" },
      { key: "weapon:martial", label: "Воинское оружие" },
    ],
  },
  armor: {
    key: "armor",
    label: "Доспехи",
    description: "Ты умеешь использовать:",
    iconSlot: "sheet:proficiencies:armor",
    catalogMode: "closed",
    entries: [
      { key: "armor:light", label: "Лёгкие доспехи" },
      { key: "armor:medium", label: "Средние доспехи" },
      { key: "armor:heavy", label: "Тяжёлые доспехи" },
      { key: "armor:shield", label: "Щиты" },
    ],
  },
  tools: {
    key: "tools",
    label: "Инструменты",
    description: "Ты владеешь следующими наборами:",
    iconSlot: "sheet:proficiencies:tools",
    catalogMode: "open",
    entries: [
      { key: "tool:herbalism-kit", label: "Набор травника" },
      { key: "tool:scribes-tools", label: "Инструменты писца" },
    ],
  },
  languages: {
    key: "languages",
    label: "Языки",
    description: "Ты говоришь и понимаешь:",
    iconSlot: "sheet:proficiencies:languages",
    catalogMode: "open",
    entries: [
      { key: "common", label: "Общий" },
      { key: "druidic", label: "Друидический" },
      { key: "draconic", label: "Драконий" },
      { key: "goblin", label: "Гоблинский" },
    ],
  },
  saving_throws: {
    key: "saving_throws",
    label: "Спасброски",
    description: "У тебя есть владение в следующих спасбросках:",
    iconSlot: "sheet:proficiencies:saving-throws",
    catalogMode: "closed",
    entries: [
      { key: "savingThrow:strength", label: "Сила" },
      { key: "savingThrow:dexterity", label: "Ловкость" },
      { key: "savingThrow:constitution", label: "Телосложение" },
      { key: "savingThrow:intelligence", label: "Интеллект" },
      { key: "savingThrow:wisdom", label: "Мудрость" },
      { key: "savingThrow:charisma", label: "Харизма" },
    ],
  },
} as const satisfies Record<
  CharacterProficiencyGroupKey,
  CharacterProficiencyGroupContract
>

export function characterProficiencyGroupContract(
  group: CharacterProficiencyGroupKey,
): CharacterProficiencyGroupContract {
  return CHARACTER_PROFICIENCY_GROUPS[group]
}

export function characterProficiencyCatalogEntry(
  group: CharacterProficiencyGroupKey,
  key: string,
): CharacterProficiencyCatalogEntry | null {
  return (
    CHARACTER_PROFICIENCY_GROUPS[group].entries.find(
      (entry) => entry.key === key,
    ) || null
  )
}

export function characterProficiencyCatalogCount(
  group: CharacterProficiencyGroupKey,
): number | null {
  const contract = CHARACTER_PROFICIENCY_GROUPS[group]
  return contract.catalogMode === "closed"
    ? contract.entries.length
    : null
}

export function characterProficiencyGroupForGrant(
  target: string,
  key: string,
): CharacterProficiencyGroupKey | null {
  if (target === "language") return "languages"
  if (target !== "proficiency") return null

  if (key.startsWith("weapon:")) return "weapons"
  if (key.startsWith("armor:")) return "armor"
  if (key.startsWith("tool:")) return "tools"
  if (key.startsWith("savingThrow:")) return "saving_throws"

  return null
}
