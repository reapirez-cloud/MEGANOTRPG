export type HubSection = {
  id: string
  title: string
  caption: string
  tone: "stone" | "ash" | "steel" | "night"
  image?: string
  state?: "live" | "placeholder"
}

/**
 * UI v1 section registries are intentionally data-driven.
 *
 * Adding a new top-level tile later (for example "Предметы" in Knowledge Base)
 * should require one registry entry. Unknown subsection routes automatically
 * land on a clean connection placeholder until their content screen is built.
 */
export const worldHubSections: HubSection[] = [
  { id: "locations", title: "Локации", caption: "Места и вложенные области мира", tone: "stone", image: "/ui-v1/panels/world-locations.webp", state: "live" },
  // Keep the stable technical route id "characters"; the player-facing World surface contains world characters.
  // Player-controlled characters are presented elsewhere as "Игроки"; storage may still use character_type = "npc".
  { id: "characters", title: "Персонажи", caption: "Известные персонажи и жители мира", tone: "ash", image: "/ui-v1/panels/world-characters.webp", state: "live" },
  { id: "lore", title: "Лор", caption: "Статьи, записи и сведения о мире", tone: "steel", image: "/ui-v1/panels/world-lore.webp", state: "live" },
  { id: "map", title: "Карта", caption: "Отдельный раздел карты мира", tone: "night", state: "placeholder" },
]

export const knowledgeBaseSections: HubSection[] = [
  { id: "spells", title: "Заклинания", caption: "Каталог заклинаний и точные правила", tone: "steel", state: "live" },
  { id: "classes", title: "Классы", caption: "Классы, прогрессия и подклассы", tone: "stone", state: "live" },
  { id: "invocations", title: "Инвокации", caption: "Таинственные воззвания колдуна", tone: "night", state: "live" },
  { id: "bestiary", title: "Бестиарий", caption: "Существа и их игровые характеристики", tone: "ash", state: "live" },
  { id: "chaos", title: "Болезни, безумия и дикая магия", caption: "Отдельные справочные таблицы и эффекты", tone: "steel", state: "placeholder" },
]
