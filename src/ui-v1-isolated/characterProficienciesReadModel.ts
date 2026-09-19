import type {
  AbilityKey,
  ResolvedCharacterContract,
  ResolvedGrant,
  ResolvedSourceRef,
} from "../character-engine/index.ts"
import type { CharacterSheet } from "../types/characterSheet.ts"
import {
  CHARACTER_PROFICIENCY_GROUP_ORDER,
  CHARACTER_PROFICIENCY_GROUPS,
  CHARACTER_PROFICIENCY_SAVING_THROW_ABILITIES,
  characterProficiencyCatalogCount,
  characterProficiencyCatalogEntry,
  characterProficiencyGroupForGrant,
  type CharacterProficiencyGroupKey,
} from "./characterProficienciesCatalog.ts"

export type CharacterProficiencyRowOrigin =
  | "character-engine"
  | "legacy"

export type CharacterProficiencySource = {
  contributionId: string | null
  sourceId: string
  name: string
  sourceType: string
}

export type CharacterProficiencyRow = {
  id: string
  group: CharacterProficiencyGroupKey
  key: string
  label: string
  rank: 1 | 2
  origin: CharacterProficiencyRowOrigin
  catalogued: boolean
  sources: CharacterProficiencySource[]
}

export type CharacterProficiencyGroup = {
  key: CharacterProficiencyGroupKey
  label: string
  description: string
  iconSlot: string
  catalogMode: "closed" | "open"
  catalogCount: number | null
  rows: CharacterProficiencyRow[]
  currentCount: number
}

export type CharacterProficienciesReadModel = {
  groups: CharacterProficiencyGroup[]
  unclassifiedRuntimeKeys: string[]
  unclassifiedLegacyTokens: string[]
}

export type CharacterProficienciesLegacyInput =
  | Pick<
      CharacterSheet,
      "proficiencies" | "languages" | "saving_throw_proficiencies"
    >
  | null
  | undefined

export type CharacterProficienciesReadModelInput = {
  contract: ResolvedCharacterContract
  legacy?: CharacterProficienciesLegacyInput
}

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: "Сила",
  dexterity: "Ловкость",
  constitution: "Телосложение",
  intelligence: "Интеллект",
  wisdom: "Мудрость",
  charisma: "Харизма",
}

const LEGACY_PROFICIENCY_PATTERNS: readonly {
  group: Exclude<CharacterProficiencyGroupKey, "languages" | "saving_throws">
  key: string
  label: string
  pattern: RegExp
}[] = [
  {
    group: "weapons",
    key: "weapon:simple",
    label: "Простое оружие",
    pattern: /прост(?:ое|ым|ого)?\s+оруж/iu,
  },
  {
    group: "weapons",
    key: "weapon:martial",
    label: "Воинское оружие",
    pattern: /воинск(?:ое|им|ого)?\s+оруж/iu,
  },
  {
    group: "armor",
    key: "armor:light",
    label: "Лёгкие доспехи",
    pattern: /л[её]гк(?:ие|ими|их)?(?=[^;.\n]*(?:доспех|брон))/iu,
  },
  {
    group: "armor",
    key: "armor:medium",
    label: "Средние доспехи",
    pattern: /средн(?:ие|ими|их)?(?=[^;.\n]*(?:доспех|брон))/iu,
  },
  {
    group: "armor",
    key: "armor:heavy",
    label: "Тяжёлые доспехи",
    pattern: /тяж[её]л(?:ые|ыми|ых)?(?=[^;.\n]*(?:доспех|брон))/iu,
  },
  {
    group: "armor",
    key: "armor:shield",
    label: "Щиты",
    pattern: /щит(?:ы|ами|ов|а)?/iu,
  },
  {
    group: "tools",
    key: "tool:herbalism-kit",
    label: "Набор травника",
    pattern: /набор\s+травник/iu,
  },
  {
    group: "tools",
    key: "tool:scribes-tools",
    label: "Инструменты писца",
    pattern: /инструмент(?:ы|ами|ов)?\s+писц/iu,
  },
]

const LEGACY_LANGUAGE_ALIASES: Record<string, string> = {
  "общий": "common",
  "друидический": "druidic",
  "драконий": "draconic",
  "гоблинский": "goblin",
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : ""
}

function normalizeLabel(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/[.:;,]+$/g, "")
    .replace(/\s+/g, " ")
}

function legacyKey(value: string) {
  return normalizeLabel(value)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}

function payloadLabel(grant: ResolvedGrant) {
  return text(record(grant.payload)?.label)
}

function payloadRank(grant: ResolvedGrant): 1 | 2 {
  const rank = record(grant.payload)?.rank
  return rank === 2 ? 2 : 1
}

function sourcesFromRefs(
  refs: readonly ResolvedSourceRef[],
): CharacterProficiencySource[] {
  const seen = new Set<string>()
  const result: CharacterProficiencySource[] = []

  for (const ref of refs) {
    const sourceId = ref.source.id.trim()
    const identity = ref.contributionId + ":" + sourceId
    if (seen.has(identity)) continue
    seen.add(identity)

    result.push({
      contributionId: ref.contributionId,
      sourceId,
      name: ref.source.name?.trim() || "Источник",
      sourceType: ref.source.sourceType?.trim() || "unknown",
    })
  }

  return result
}

function mergeSources(
  left: readonly CharacterProficiencySource[],
  right: readonly CharacterProficiencySource[],
) {
  const result = [...left]
  const seen = new Set(
    result.map((source) =>
      (source.contributionId || "") + ":" + source.sourceId
    ),
  )

  for (const source of right) {
    const identity = (source.contributionId || "") + ":" + source.sourceId
    if (seen.has(identity)) continue
    seen.add(identity)
    result.push(source)
  }

  return result
}

function fallbackLabel(
  group: CharacterProficiencyGroupKey,
  key: string,
  grantLabel = "",
) {
  const catalog = characterProficiencyCatalogEntry(group, key)
  if (catalog) return catalog.label
  if (grantLabel) {
    return group === "saving_throws"
      ? grantLabel.replace(/^Спасбросок:\s*/iu, "")
      : grantLabel
  }

  const tail = key.includes(":")
    ? key.slice(key.indexOf(":") + 1)
    : key
  return tail
    .replace(/[-_]+/g, " ")
    .replace(/^./u, (character) => character.toLocaleUpperCase("ru-RU"))
}

function runtimeRow(
  group: CharacterProficiencyGroupKey,
  key: string,
  label: string,
  rank: 1 | 2,
  sources: readonly ResolvedSourceRef[],
): CharacterProficiencyRow {
  return {
    id: group + ":" + key,
    group,
    key,
    label: fallbackLabel(group, key, label),
    rank,
    origin: "character-engine",
    catalogued: Boolean(characterProficiencyCatalogEntry(group, key)),
    sources: sourcesFromRefs(sources),
  }
}

function legacyRow(
  group: CharacterProficiencyGroupKey,
  key: string,
  label: string,
): CharacterProficiencyRow {
  return {
    id: group + ":legacy:" + key,
    group,
    key,
    label,
    rank: 1,
    origin: "legacy",
    catalogued: Boolean(characterProficiencyCatalogEntry(group, key)),
    sources: [{
      contributionId: null,
      sourceId: "legacy:character-sheet",
      name: "Лист персонажа",
      sourceType: "legacy_character_sheet",
    }],
  }
}

function rowIdentity(row: CharacterProficiencyRow) {
  return row.group + ":" + row.key
}

function mergeRow(
  rows: Map<string, CharacterProficiencyRow>,
  incoming: CharacterProficiencyRow,
) {
  const identity = rowIdentity(incoming)
  const existing = rows.get(identity)

  if (!existing) {
    rows.set(identity, incoming)
    return
  }

  rows.set(identity, {
    ...existing,
    label:
      existing.origin === "character-engine"
        ? existing.label
        : incoming.label || existing.label,
    rank: Math.max(existing.rank, incoming.rank) as 1 | 2,
    origin:
      existing.origin === "character-engine" ||
      incoming.origin === "character-engine"
        ? "character-engine"
        : "legacy",
    catalogued: existing.catalogued || incoming.catalogued,
    sources: mergeSources(existing.sources, incoming.sources),
  })
}

function abilityFromSavingThrowKey(key: string): AbilityKey | null {
  const value = key.startsWith("savingThrow:")
    ? key.slice("savingThrow:".length)
    : key

  return CHARACTER_PROFICIENCY_SAVING_THROW_ABILITIES.includes(
    value as AbilityKey,
  )
    ? value as AbilityKey
    : null
}

function splitLegacyClauses(value: string) {
  return value
    .replace(/[.!?]\s+/g, ";")
    .split(/[;\n]+/g)
    .map((item) => item.trim().replace(/[.!?]+$/g, "").trim())
    .filter(Boolean)
}

function isNegativeOwnershipClause(value: string) {
  return /(?:^|\s)без(?:\s|$)/iu.test(value)
}

function legacyProficiencyRows(value: string) {
  const rows: CharacterProficiencyRow[] = []
  const unclassified: string[] = []

  for (const clause of splitLegacyClauses(value)) {
    if (isNegativeOwnershipClause(clause)) continue

    const matched = new Set<string>()

    for (const entry of LEGACY_PROFICIENCY_PATTERNS) {
      if (!entry.pattern.test(clause)) continue
      const identity = entry.group + ":" + entry.key
      if (matched.has(identity)) continue
      matched.add(identity)
      rows.push(legacyRow(entry.group, entry.key, entry.label))
    }

    if (!matched.size) unclassified.push(clause)
  }

  return { rows, unclassified }
}

function legacyLanguageRows(value: string) {
  return value
    .split(/[;,\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.split(":")[0]?.trim() || "")
    .filter(Boolean)
    .map((label) => {
      const normalized = normalizeLabel(label)
      const key =
        LEGACY_LANGUAGE_ALIASES[normalized] ||
        "legacy-language:" + legacyKey(label)
      const catalogLabel = characterProficiencyCatalogEntry(
        "languages",
        key,
      )?.label

      return legacyRow(
        "languages",
        key,
        catalogLabel || label,
      )
    })
}

function legacySavingThrowRows(values: readonly string[]) {
  return values.flatMap((value) => {
    const ability = abilityFromSavingThrowKey(value.trim())
    if (!ability) return []

    const key = "savingThrow:" + ability
    return [legacyRow(
      "saving_throws",
      key,
      ABILITY_LABELS[ability],
    )]
  })
}

function rowSort(
  group: CharacterProficiencyGroupKey,
  left: CharacterProficiencyRow,
  right: CharacterProficiencyRow,
) {
  const entries = CHARACTER_PROFICIENCY_GROUPS[group].entries
  const rank = (key: string) => {
    const index = entries.findIndex((entry) => entry.key === key)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }

  return (
    rank(left.key) - rank(right.key) ||
    left.label.localeCompare(right.label, "ru") ||
    left.key.localeCompare(right.key, "en")
  )
}

function dedupeLegacyLanguageAgainstRuntime(
  rows: Map<string, CharacterProficiencyRow>,
  incoming: CharacterProficiencyRow,
) {
  const normalized = normalizeLabel(incoming.label)
  const existing = [...rows.values()].find(
    (row) =>
      row.group === "languages" &&
      row.origin === "character-engine" &&
      normalizeLabel(row.label) === normalized,
  )

  if (existing) return
  mergeRow(rows, incoming)
}

export function buildCharacterProficienciesReadModel(
  input: CharacterProficienciesReadModelInput,
): CharacterProficienciesReadModel {
  const rows = new Map<string, CharacterProficiencyRow>()
  const unclassifiedRuntime = new Set<string>()

  const runtimeGrants: ResolvedGrant[] = [
    ...input.contract.capabilities.proficiencies,
    ...input.contract.capabilities.languages,
  ]

  for (const grant of runtimeGrants) {
    const group = characterProficiencyGroupForGrant(
      grant.target,
      grant.key,
    )

    if (!group) {
      if (grant.target === "proficiency") {
        unclassifiedRuntime.add(grant.key)
      }
      continue
    }

    mergeRow(
      rows,
      runtimeRow(
        group,
        grant.key,
        payloadLabel(grant),
        payloadRank(grant),
        grant.sources,
      ),
    )
  }

  for (const ability of CHARACTER_PROFICIENCY_SAVING_THROW_ABILITIES) {
    const savingThrow = input.contract.savingThrows[ability]
    if (!savingThrow || savingThrow.proficiencyRank <= 0) continue

    const key = "savingThrow:" + ability
    mergeRow(
      rows,
      runtimeRow(
        "saving_throws",
        key,
        ABILITY_LABELS[ability],
        savingThrow.proficiencyRank === 2 ? 2 : 1,
        savingThrow.proficiencySources,
      ),
    )
  }

  const unclassifiedLegacy = new Set<string>()
  const legacy = input.legacy

  if (legacy) {
    const proficiencies = legacyProficiencyRows(
      text(legacy.proficiencies),
    )
    for (const row of proficiencies.rows) mergeRow(rows, row)
    for (const value of proficiencies.unclassified) {
      unclassifiedLegacy.add(value)
    }

    for (const row of legacyLanguageRows(text(legacy.languages))) {
      dedupeLegacyLanguageAgainstRuntime(rows, row)
    }

    for (
      const row of legacySavingThrowRows(
        Array.isArray(legacy.saving_throw_proficiencies)
          ? legacy.saving_throw_proficiencies
          : [],
      )
    ) {
      mergeRow(rows, row)
    }
  }

  const groups = CHARACTER_PROFICIENCY_GROUP_ORDER.map((key) => {
    const contract = CHARACTER_PROFICIENCY_GROUPS[key]
    const groupRows = [...rows.values()]
      .filter((row) => row.group === key)
      .sort((left, right) => rowSort(key, left, right))

    return {
      key,
      label: contract.label,
      description: contract.description,
      iconSlot: contract.iconSlot,
      catalogMode: contract.catalogMode,
      catalogCount: characterProficiencyCatalogCount(key),
      rows: groupRows,
      currentCount: groupRows.length,
    } satisfies CharacterProficiencyGroup
  })

  return {
    groups,
    unclassifiedRuntimeKeys: [...unclassifiedRuntime].sort(
      (left, right) => left.localeCompare(right, "en"),
    ),
    unclassifiedLegacyTokens: [...unclassifiedLegacy].sort(
      (left, right) => left.localeCompare(right, "ru"),
    ),
  }
}
