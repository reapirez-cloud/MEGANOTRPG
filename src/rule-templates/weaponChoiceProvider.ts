export type WeaponChoiceCategory = "simple" | "martial"

export type WeaponChoiceCatalogEntry = {
  key: `weapon:${string}`
  label: string
  category: WeaponChoiceCategory
  properties: readonly string[]
  mastery: string
}

/**
 * Shared 2024 weapon identities used by dynamic template choices such as
 * Weapon Mastery. This is rules infrastructure, not Rogue-owned data.
 */
export const WEAPON_CHOICE_CATALOG = [
  { key: "weapon:club", label: "Дубинка", category: "simple", properties: ["light"], mastery: "Slow" },
  { key: "weapon:dagger", label: "Кинжал", category: "simple", properties: ["finesse", "light", "thrown"], mastery: "Nick" },
  { key: "weapon:greatclub", label: "Большая дубинка", category: "simple", properties: ["two-handed"], mastery: "Push" },
  { key: "weapon:handaxe", label: "Ручной топор", category: "simple", properties: ["light", "thrown"], mastery: "Vex" },
  { key: "weapon:javelin", label: "Метательное копьё", category: "simple", properties: ["thrown"], mastery: "Slow" },
  { key: "weapon:light-hammer", label: "Лёгкий молот", category: "simple", properties: ["light", "thrown"], mastery: "Nick" },
  { key: "weapon:mace", label: "Булава", category: "simple", properties: [], mastery: "Sap" },
  { key: "weapon:quarterstaff", label: "Боевой посох", category: "simple", properties: ["versatile"], mastery: "Topple" },
  { key: "weapon:sickle", label: "Серп", category: "simple", properties: ["light"], mastery: "Nick" },
  { key: "weapon:spear", label: "Копьё", category: "simple", properties: ["thrown", "versatile"], mastery: "Sap" },
  { key: "weapon:dart", label: "Дротик", category: "simple", properties: ["finesse", "thrown"], mastery: "Vex" },
  { key: "weapon:light-crossbow", label: "Лёгкий арбалет", category: "simple", properties: ["ammunition", "loading", "two-handed"], mastery: "Slow" },
  { key: "weapon:shortbow", label: "Короткий лук", category: "simple", properties: ["ammunition", "two-handed"], mastery: "Vex" },
  { key: "weapon:sling", label: "Праща", category: "simple", properties: ["ammunition"], mastery: "Slow" },

  { key: "weapon:battleaxe", label: "Боевой топор", category: "martial", properties: ["versatile"], mastery: "Topple" },
  { key: "weapon:flail", label: "Цеп", category: "martial", properties: [], mastery: "Sap" },
  { key: "weapon:glaive", label: "Глефа", category: "martial", properties: ["heavy", "reach", "two-handed"], mastery: "Graze" },
  { key: "weapon:greataxe", label: "Секира", category: "martial", properties: ["heavy", "two-handed"], mastery: "Cleave" },
  { key: "weapon:greatsword", label: "Двуручный меч", category: "martial", properties: ["heavy", "two-handed"], mastery: "Graze" },
  { key: "weapon:halberd", label: "Алебарда", category: "martial", properties: ["heavy", "reach", "two-handed"], mastery: "Cleave" },
  { key: "weapon:lance", label: "Копьё всадника", category: "martial", properties: ["heavy", "reach", "two-handed"], mastery: "Topple" },
  { key: "weapon:longsword", label: "Длинный меч", category: "martial", properties: ["versatile"], mastery: "Sap" },
  { key: "weapon:maul", label: "Молот", category: "martial", properties: ["heavy", "two-handed"], mastery: "Topple" },
  { key: "weapon:morningstar", label: "Моргенштерн", category: "martial", properties: [], mastery: "Sap" },
  { key: "weapon:pike", label: "Пика", category: "martial", properties: ["heavy", "reach", "two-handed"], mastery: "Push" },
  { key: "weapon:rapier", label: "Рапира", category: "martial", properties: ["finesse"], mastery: "Vex" },
  { key: "weapon:scimitar", label: "Скимитар", category: "martial", properties: ["finesse", "light"], mastery: "Nick" },
  { key: "weapon:shortsword", label: "Короткий меч", category: "martial", properties: ["finesse", "light"], mastery: "Vex" },
  { key: "weapon:trident", label: "Трезубец", category: "martial", properties: ["thrown", "versatile"], mastery: "Topple" },
  { key: "weapon:war-pick", label: "Боевая кирка", category: "martial", properties: ["versatile"], mastery: "Sap" },
  { key: "weapon:warhammer", label: "Боевой молот", category: "martial", properties: ["versatile"], mastery: "Push" },
  { key: "weapon:whip", label: "Кнут", category: "martial", properties: ["finesse", "reach"], mastery: "Slow" },
  { key: "weapon:blowgun", label: "Духовая трубка", category: "martial", properties: ["ammunition", "loading"], mastery: "Vex" },
  { key: "weapon:hand-crossbow", label: "Ручной арбалет", category: "martial", properties: ["ammunition", "light", "loading"], mastery: "Vex" },
  { key: "weapon:heavy-crossbow", label: "Тяжёлый арбалет", category: "martial", properties: ["ammunition", "heavy", "loading", "two-handed"], mastery: "Push" },
  { key: "weapon:longbow", label: "Длинный лук", category: "martial", properties: ["ammunition", "heavy", "two-handed"], mastery: "Slow" },
  { key: "weapon:musket", label: "Мушкет", category: "martial", properties: ["ammunition", "loading", "two-handed"], mastery: "Slow" },
  { key: "weapon:pistol", label: "Пистолет", category: "martial", properties: ["ammunition", "loading"], mastery: "Vex" },
] as const satisfies readonly WeaponChoiceCatalogEntry[]

const byKey = new Map(WEAPON_CHOICE_CATALOG.map((entry) => [entry.key, entry] as const))

export function weaponChoiceCatalogEntry(key: string): WeaponChoiceCatalogEntry | null {
  return byKey.get(key as `weapon:${string}`) || null
}

export function weaponProficiencyCoversChoice(
  proficiencyKey: string,
  weaponKey: string,
): boolean {
  const weapon = weaponChoiceCatalogEntry(weaponKey)
  if (!weapon) return proficiencyKey === weaponKey
  if (proficiencyKey === weaponKey) return true
  if (proficiencyKey === "weapon:simple") return weapon.category === "simple"
  if (proficiencyKey === "weapon:martial") return weapon.category === "martial"
  if (proficiencyKey === "weapon:martial-light") {
    return weapon.category === "martial" && weapon.properties.includes("light")
  }
  if (proficiencyKey === "weapon:martial-finesse") {
    return weapon.category === "martial" && weapon.properties.includes("finesse")
  }
  if (proficiencyKey === "weapon:martial-finesse-or-light") {
    return weapon.category === "martial"
      && (weapon.properties.includes("finesse") || weapon.properties.includes("light"))
  }
  return false
}
