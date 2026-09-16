import {
  CHARACTER_SHEET_FEATURE_SOURCE_ORDER,
  CHARACTER_SHEET_FEATURE_TIMING_ORDER,
} from "./characterSheetUiContract.ts"

export type CharacterSheetPreparationState =
  | "always_prepared"
  | "prepared"
  | "unprepared"
  | "not_required"

export type SpellPreparationAccessLike = {
  preparationMode: "prepared" | "always_prepared" | "not_required"
  prepared: boolean
}

export function resolveSpellPreparationState(
  accesses: readonly SpellPreparationAccessLike[],
): CharacterSheetPreparationState {
  if (accesses.some((access) => access.preparationMode === "always_prepared")) {
    return "always_prepared"
  }

  if (
    accesses.some(
      (access) =>
        access.preparationMode === "prepared" &&
        access.prepared,
    )
  ) {
    return "prepared"
  }

  if (accesses.some((access) => access.preparationMode === "not_required")) {
    return "not_required"
  }

  if (accesses.some((access) => access.preparationMode === "prepared")) {
    return "unprepared"
  }

  return "not_required"
}

export function spellPreparationRank(
  value: CharacterSheetPreparationState,
) {
  return value === "always_prepared" || value === "prepared" ? 0 : 1
}

export function hasMutablePreparationWorkflow(
  spells: readonly {
    accesses: readonly SpellPreparationAccessLike[]
  }[],
) {
  return spells.some((spell) =>
    spell.accesses.some(
      (access) => access.preparationMode === "prepared",
    )
  )
}

const CANONICAL_SCHOOLS = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
] as const

export function normalizeSpellSchool(value: string) {
  const clean = value.trim()
  if (!clean) return ""

  const canonical = CANONICAL_SCHOOLS.find(
    (school) =>
      school.toLocaleLowerCase("en-US") ===
      clean.toLocaleLowerCase("en-US"),
  )

  return canonical || clean
}

export function stableUniqueSortedStrings(
  values: readonly string[],
  locale = "ru",
) {
  return [...new Set(
    values
      .map((value) => value.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, locale))
}

export function summarizeSourceNames(
  values: readonly string[],
  maxVisible = 2,
) {
  const names = stableUniqueSortedStrings(values)
  const visibleCount = Math.max(1, Math.floor(maxVisible))
  if (names.length <= visibleCount) return names.join(" · ")

  return names.slice(0, visibleCount).join(" · ") +
    ` · +${names.length - visibleCount}`
}

export function isStandardSpellLevel(level: number) {
  return Number.isInteger(level) && level >= 0 && level <= 9
}

export type FeatureSortCategory =
  typeof CHARACTER_SHEET_FEATURE_SOURCE_ORDER[number]

export type FeatureSortTiming =
  typeof CHARACTER_SHEET_FEATURE_TIMING_ORDER[number]

export type FeatureSourceCandidate = {
  category: FeatureSortCategory
  sourceName: string
  originId: string
}

const CATEGORY_RANK = new Map(
  CHARACTER_SHEET_FEATURE_SOURCE_ORDER.map(
    (key, index) => [key, index] as const,
  ),
)

const TIMING_RANK = new Map(
  CHARACTER_SHEET_FEATURE_TIMING_ORDER.map(
    (key, index) => [key, index] as const,
  ),
)

export function compareFeatureSourceCandidates(
  left: FeatureSourceCandidate,
  right: FeatureSourceCandidate,
) {
  return (
    (left.category === "other" ? 1 : 0) -
      (right.category === "other" ? 1 : 0) ||
    (CATEGORY_RANK.get(left.category) ?? 99) -
      (CATEGORY_RANK.get(right.category) ?? 99) ||
    left.sourceName.localeCompare(right.sourceName, "ru") ||
    left.originId.localeCompare(right.originId)
  )
}

export function stableProvenanceSignature(
  sourceIds: readonly string[],
) {
  return [...new Set(
    sourceIds.map((value) => value.trim() || "unknown"),
  )].sort().join("|")
}

export function earliestKnownUnlockLevel(
  values: readonly (number | null | undefined)[],
) {
  const known = values.filter(
    (level): level is number =>
      typeof level === "number" &&
      Number.isInteger(level) &&
      level >= 1,
  )

  return known.length ? Math.min(...known) : null
}

export type FeatureSortEntry = {
  category: FeatureSortCategory
  sourceName: string
  timing: FeatureSortTiming
  unlockLevel: number | null
  label: string
}

export function compareFeatureEntries(
  left: FeatureSortEntry,
  right: FeatureSortEntry,
) {
  return (
    (CATEGORY_RANK.get(left.category) ?? 99) -
      (CATEGORY_RANK.get(right.category) ?? 99) ||
    left.sourceName.localeCompare(right.sourceName, "ru") ||
    (TIMING_RANK.get(left.timing) ?? 99) -
      (TIMING_RANK.get(right.timing) ?? 99) ||
    (left.unlockLevel ?? Number.MAX_SAFE_INTEGER) -
      (right.unlockLevel ?? Number.MAX_SAFE_INTEGER) ||
    left.label.localeCompare(right.label, "ru")
  )
}
