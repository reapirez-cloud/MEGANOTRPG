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
      { key: "weapon:martial-light", label: "Воинское оружие со свойством «Лёгкое»" },
      { key: "weapon:club", label: "Дубинка" },
      { key: "weapon:dagger", label: "Кинжал" },
      { key: "weapon:greatclub", label: "Большая дубинка" },
      { key: "weapon:handaxe", label: "Ручной топор" },
      { key: "weapon:javelin", label: "Метательное копьё" },
      { key: "weapon:light-hammer", label: "Лёгкий молот" },
      { key: "weapon:mace", label: "Булава" },
      { key: "weapon:quarterstaff", label: "Боевой посох" },
      { key: "weapon:sickle", label: "Серп" },
      { key: "weapon:spear", label: "Копьё" },
      { key: "weapon:battleaxe", label: "Боевой топор" },
      { key: "weapon:flail", label: "Цеп" },
      { key: "weapon:longsword", label: "Длинный меч" },
      { key: "weapon:morningstar", label: "Моргенштерн" },
      { key: "weapon:rapier", label: "Рапира" },
      { key: "weapon:scimitar", label: "Скимитар" },
      { key: "weapon:shortsword", label: "Короткий меч" },
      { key: "weapon:trident", label: "Трезубец" },
      { key: "weapon:war-pick", label: "Боевая кирка" },
      { key: "weapon:warhammer", label: "Боевой молот" },
      { key: "weapon:whip", label: "Кнут" },
      { key: "weapon:dart", label: "Дротик" },
      { key: "weapon:light-crossbow", label: "Лёгкий арбалет" },
      { key: "weapon:shortbow", label: "Короткий лук" },
      { key: "weapon:sling", label: "Праща" },
      { key: "weapon:blowgun", label: "Духовая трубка" },
      { key: "weapon:hand-crossbow", label: "Ручной арбалет" },
      { key: "weapon:longbow", label: "Длинный лук" },
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
      { key: "tool:alchemist-supplies", label: "Инструменты алхимика" },
      { key: "tool:brewer-supplies", label: "Инструменты пивовара" },
      { key: "tool:calligrapher-supplies", label: "Инструменты каллиграфа" },
      { key: "tool:carpenter-tools", label: "Инструменты плотника" },
      { key: "tool:cartographer-tools", label: "Инструменты картографа" },
      { key: "tool:cobbler-tools", label: "Инструменты сапожника" },
      { key: "tool:cook-utensils", label: "Инструменты повара" },
      { key: "tool:glassblower-tools", label: "Инструменты стеклодува" },
      { key: "tool:jeweler-tools", label: "Инструменты ювелира" },
      { key: "tool:leatherworker-tools", label: "Инструменты кожевника" },
      { key: "tool:mason-tools", label: "Инструменты каменщика" },
      { key: "tool:painter-supplies", label: "Инструменты художника" },
      { key: "tool:potter-tools", label: "Инструменты гончара" },
      { key: "tool:smith-tools", label: "Инструменты кузнеца" },
      { key: "tool:tinker-tools", label: "Инструменты ремонтника" },
      { key: "tool:weaver-tools", label: "Инструменты ткача" },
      { key: "tool:woodcarver-tools", label: "Инструменты резчика по дереву" },
      { key: "tool:musical:bagpipes", label: "Волынка" },
      { key: "tool:musical:drum", label: "Барабан" },
      { key: "tool:musical:dulcimer", label: "Цимбалы" },
      { key: "tool:musical:flute", label: "Флейта" },
      { key: "tool:musical:horn", label: "Рожок" },
      { key: "tool:musical:lute", label: "Лютня" },
      { key: "tool:musical:lyre", label: "Лира" },
      { key: "tool:musical:pan-flute", label: "Свирель Пана" },
      { key: "tool:musical:shawm", label: "Шалмей" },
      { key: "tool:musical:viol", label: "Виола" },
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
      { key: "dwarvish", label: "Дварфский" },
      { key: "elvish", label: "Эльфийский" },
      { key: "giant", label: "Великаний" },
      { key: "gnomish", label: "Гномий" },
      { key: "goblin", label: "Гоблинский" },
      { key: "halfling", label: "Полуросликов" },
      { key: "orc", label: "Орочий" },
      { key: "abyssal", label: "Бездны" },
      { key: "celestial", label: "Небесный" },
      { key: "deep-speech", label: "Глубинная речь" },
      { key: "draconic", label: "Драконий" },
      { key: "infernal", label: "Инфернальный" },
      { key: "primordial", label: "Первичный" },
      { key: "sylvan", label: "Сильван" },
      { key: "undercommon", label: "Подземный общий" },
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
