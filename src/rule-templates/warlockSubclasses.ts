import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"

export const WARLOCK_SUBCLASS_PARENT_CATALOG_KEY = "class:warlock" as const
export const WARLOCK_SUBCLASS_UNLOCK_LEVEL = 3 as const
export const WARLOCK_SUBCLASS_FEATURE_LEVELS = [3, 6, 10, 14] as const
export const WARLOCK_SUBCLASS_RUNTIME_LEVELS = [3, 5, 6, 7, 9, 10, 14] as const
export const WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS = [
  "subclass:warlock:archfey",
  "subclass:warlock:celestial",
  "subclass:warlock:fiend",
  "subclass:warlock:great-old-one",
] as const

export type WarlockPhb2024SubclassCatalogKey = (typeof WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS)[number]

export type WarlockSubclassDefinition = {
  catalogKey: WarlockPhb2024SubclassCatalogKey
  slug: string
  name: string
  englishName: string
  sourceLabel: "Player's Handbook 2024"
  rulesRevision: "phb-2024"
  visualKey: `warlock-subclass:${string}`
  unlockLevel: typeof WARLOCK_SUBCLASS_UNLOCK_LEVEL
  featureLevels: readonly number[]
  runtimeLevels: readonly number[]
}

const featureLevels = WARLOCK_SUBCLASS_FEATURE_LEVELS
const runtimeLevels = WARLOCK_SUBCLASS_RUNTIME_LEVELS

export const WARLOCK_PHB2024_SUBCLASSES = [
  {
    catalogKey: "subclass:warlock:archfey",
    slug: "warlock-archfey",
    name: "Архифея",
    englishName: "Archfey Patron",
    sourceLabel: "Player's Handbook 2024",
    rulesRevision: "phb-2024",
    visualKey: "warlock-subclass:archfey",
    unlockLevel: 3,
    featureLevels,
    runtimeLevels,
  },
  {
    catalogKey: "subclass:warlock:celestial",
    slug: "warlock-celestial",
    name: "Небожитель",
    englishName: "Celestial Patron",
    sourceLabel: "Player's Handbook 2024",
    rulesRevision: "phb-2024",
    visualKey: "warlock-subclass:celestial",
    unlockLevel: 3,
    featureLevels,
    runtimeLevels,
  },
  {
    catalogKey: "subclass:warlock:fiend",
    slug: "warlock-fiend",
    name: "Исчадие",
    englishName: "Fiend Patron",
    sourceLabel: "Player's Handbook 2024",
    rulesRevision: "phb-2024",
    visualKey: "warlock-subclass:fiend",
    unlockLevel: 3,
    featureLevels,
    runtimeLevels,
  },
  {
    catalogKey: "subclass:warlock:great-old-one",
    slug: "warlock-great-old-one",
    name: "Великий Древний",
    englishName: "Great Old One Patron",
    sourceLabel: "Player's Handbook 2024",
    rulesRevision: "phb-2024",
    visualKey: "warlock-subclass:great-old-one",
    unlockLevel: 3,
    featureLevels,
    runtimeLevels,
  },
] as const satisfies readonly WarlockSubclassDefinition[]

const supportedCatalogKeys = new Set<string>(WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS)
const supportedRuntimeLevels = new Set<number>(WARLOCK_SUBCLASS_RUNTIME_LEVELS)

export type WarlockSubclassPackageValidation = {
  template: Pick<RuleTemplate, "id" | "kind" | "catalog_key" | "parent_template_id" | "unlock_level">
  parent: Pick<RuleTemplate, "id" | "kind" | "catalog_key">
  levels: readonly Pick<RuleTemplateLevel, "level">[]
}

export function warlockSubclassPackageErrors(input: WarlockSubclassPackageValidation): string[] {
  const errors: string[] = []
  if (input.template.kind !== "subclass") errors.push("template.kind must be subclass")
  if (!input.template.catalog_key || !supportedCatalogKeys.has(input.template.catalog_key)) {
    errors.push("catalog_key is not a supported PHB 2024 Warlock subclass identity")
  }
  if (input.parent.kind !== "class" || input.parent.catalog_key !== WARLOCK_SUBCLASS_PARENT_CATALOG_KEY) {
    errors.push(`parent must be ${WARLOCK_SUBCLASS_PARENT_CATALOG_KEY}`)
  }
  if (input.template.parent_template_id !== input.parent.id) errors.push("parent_template_id must point at the Warlock template")
  if (input.template.unlock_level !== WARLOCK_SUBCLASS_UNLOCK_LEVEL) errors.push("unlock_level must be 3")
  const invalidLevels = input.levels.map((entry) => entry.level).filter((level) => !supportedRuntimeLevels.has(level))
  if (invalidLevels.length) errors.push(`unsupported Warlock subclass runtime levels: ${[...new Set(invalidLevels)].join(", ")}`)
  return errors
}

export function assertWarlockSubclassPackage(input: WarlockSubclassPackageValidation): void {
  const errors = warlockSubclassPackageErrors(input)
  if (errors.length) throw new Error(`Invalid Warlock subclass package: ${errors.join("; ")}`)
}
