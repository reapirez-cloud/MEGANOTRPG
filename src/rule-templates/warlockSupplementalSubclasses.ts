import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"

export const WARLOCK_SUPPLEMENTAL_SUBCLASS_PARENT_CATALOG_KEY = "class:warlock" as const
export const WARLOCK_SUPPLEMENTAL_SUBCLASS_UNLOCK_LEVEL = 3 as const
export const WARLOCK_SUPPLEMENTAL_SUBCLASS_FEATURE_LEVELS = [3, 6, 10, 14] as const
export const WARLOCK_SUPPLEMENTAL_SUBCLASS_RUNTIME_LEVELS = [3, 5, 6, 7, 9, 10, 14] as const

export const WARLOCK_STAGE6_SUPPLEMENTAL_CATALOG_KEYS = [
  "subclass:warlock:hexblade",
  "subclass:warlock:fathomless",
  "subclass:warlock:genie",
  "subclass:warlock:undead",
] as const

export type WarlockStage6SupplementalCatalogKey = (typeof WARLOCK_STAGE6_SUPPLEMENTAL_CATALOG_KEYS)[number]

export type WarlockSupplementalSubclassDefinition = {
  catalogKey: WarlockStage6SupplementalCatalogKey
  slug: string
  name: string
  englishName: string
  sourceLabel: "Xanathar's Guide to Everything" | "Tasha's Cauldron of Everything" | "Van Richten's Guide to Ravenloft"
  rulesRevision: "xge-2017" | "tcoe-2020" | "vrgtr-2021"
  visualKey: `warlock-subclass:${string}`
  unlockLevel: typeof WARLOCK_SUPPLEMENTAL_SUBCLASS_UNLOCK_LEVEL
  featureLevels: readonly number[]
  runtimeLevels: readonly number[]
}

const featureLevels = WARLOCK_SUPPLEMENTAL_SUBCLASS_FEATURE_LEVELS
const runtimeLevels = WARLOCK_SUPPLEMENTAL_SUBCLASS_RUNTIME_LEVELS

export const WARLOCK_STAGE6_SUPPLEMENTAL_SUBCLASSES = [
  {
    catalogKey: "subclass:warlock:hexblade",
    slug: "warlock-hexblade",
    name: "Ведьмовской клинок",
    englishName: "Hexblade Patron",
    sourceLabel: "Xanathar's Guide to Everything",
    rulesRevision: "xge-2017",
    visualKey: "warlock-subclass:hexblade",
    unlockLevel: 3,
    featureLevels,
    runtimeLevels,
  },
  {
    catalogKey: "subclass:warlock:fathomless",
    slug: "warlock-fathomless",
    name: "Непостижимый",
    englishName: "The Fathomless",
    sourceLabel: "Tasha's Cauldron of Everything",
    rulesRevision: "tcoe-2020",
    visualKey: "warlock-subclass:fathomless",
    unlockLevel: 3,
    featureLevels,
    runtimeLevels,
  },
  {
    catalogKey: "subclass:warlock:genie",
    slug: "warlock-genie",
    name: "Джинн",
    englishName: "The Genie",
    sourceLabel: "Tasha's Cauldron of Everything",
    rulesRevision: "tcoe-2020",
    visualKey: "warlock-subclass:genie",
    unlockLevel: 3,
    featureLevels,
    runtimeLevels,
  },
  {
    catalogKey: "subclass:warlock:undead",
    slug: "warlock-undead",
    name: "Нежить",
    englishName: "The Undead",
    sourceLabel: "Van Richten's Guide to Ravenloft",
    rulesRevision: "vrgtr-2021",
    visualKey: "warlock-subclass:undead",
    unlockLevel: 3,
    featureLevels,
    runtimeLevels,
  },
] as const satisfies readonly WarlockSupplementalSubclassDefinition[]

const supportedCatalogKeys = new Set<string>(WARLOCK_STAGE6_SUPPLEMENTAL_CATALOG_KEYS)
const supportedRuntimeLevels = new Set<number>(WARLOCK_SUPPLEMENTAL_SUBCLASS_RUNTIME_LEVELS)

export type WarlockSupplementalPackageValidation = {
  template: Pick<RuleTemplate, "id" | "kind" | "catalog_key" | "parent_template_id" | "unlock_level">
  parent: Pick<RuleTemplate, "id" | "kind" | "catalog_key">
  levels: readonly Pick<RuleTemplateLevel, "level">[]
}

export function warlockSupplementalPackageErrors(input: WarlockSupplementalPackageValidation): string[] {
  const errors: string[] = []
  if (input.template.kind !== "subclass") errors.push("template.kind must be subclass")
  if (!input.template.catalog_key || !supportedCatalogKeys.has(input.template.catalog_key)) {
    errors.push("catalog_key is not a supported Stage 6 Warlock supplemental identity")
  }
  if (input.parent.kind !== "class" || input.parent.catalog_key !== WARLOCK_SUPPLEMENTAL_SUBCLASS_PARENT_CATALOG_KEY) {
    errors.push(`parent must be ${WARLOCK_SUPPLEMENTAL_SUBCLASS_PARENT_CATALOG_KEY}`)
  }
  if (input.template.parent_template_id !== input.parent.id) errors.push("parent_template_id must point at the Warlock template")
  if (input.template.unlock_level !== WARLOCK_SUPPLEMENTAL_SUBCLASS_UNLOCK_LEVEL) errors.push("unlock_level must be 3")
  const invalidLevels = input.levels.map((entry) => entry.level).filter((level) => !supportedRuntimeLevels.has(level))
  if (invalidLevels.length) errors.push(`unsupported Stage 6 runtime levels: ${[...new Set(invalidLevels)].join(", ")}`)
  return errors
}

export function assertWarlockSupplementalPackage(input: WarlockSupplementalPackageValidation): void {
  const errors = warlockSupplementalPackageErrors(input)
  if (errors.length) throw new Error(`Invalid Warlock Stage 6 supplemental package: ${errors.join("; ")}`)
}
