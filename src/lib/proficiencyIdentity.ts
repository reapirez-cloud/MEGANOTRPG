/**
 * Canonical D&D-like capability identities at the application/parser boundary.
 *
 * Character Engine itself stays ruleset-agnostic. Persistence may keep historical
 * option ids because selected_choices/receipts refer to them; adapters normalize
 * only the emitted CE grant key.
 */
export type CanonicalCapabilityGrantTarget = "proficiency" | "language"

const EXACT_PROFICIENCY_ALIASES: Record<string, string> = {
  "category:light_armor": "armor:light",
  "category:medium_armor": "armor:medium",
  "category:heavy_armor": "armor:heavy",
  "category:shield": "armor:shield",
  "category:shields": "armor:shield",
  "category:simple_weapons": "weapon:simple",
  "category:martial_weapons": "weapon:martial",
}

const NORMALIZED_PROFICIENCY_ALIASES: Record<string, string> = {
  "tool:brewers-supplies": "tool:brewer-supplies",
  "tool:calligraphers-supplies": "tool:calligrapher-supplies",
  "tool:painters-supplies": "tool:painter-supplies",
}

function normalizeOpenCatalogKey(value: string): string {
  const separator = value.indexOf(":")
  if (separator < 0) return value

  const prefix = value.slice(0, separator)
  const tail = value.slice(separator + 1).replace(/_/g, "-")
  return prefix + ":" + tail
}

export function canonicalCapabilityGrantKey(
  target: CanonicalCapabilityGrantTarget,
  rawKey: string,
): string {
  const trimmed = rawKey.trim()
  if (!trimmed) return trimmed

  if (target === "language") {
    const key = trimmed.startsWith("language:")
      ? trimmed.slice("language:".length)
      : trimmed
    return key.replace(/_/g, "-")
  }

  const exact = EXACT_PROFICIENCY_ALIASES[trimmed]
  if (exact) return exact

  if (
    trimmed.startsWith("weapon:") ||
    trimmed.startsWith("tool:") ||
    trimmed.startsWith("armor:")
  ) {
    const normalized = normalizeOpenCatalogKey(trimmed)
    return NORMALIZED_PROFICIENCY_ALIASES[normalized] || normalized
  }

  // skill:* and savingThrow:* are CE identities and intentionally keep their
  // underscore/camel-case spelling.
  return trimmed
}

export function isCharacterSheetProficiencyOutOfScopeKey(
  key: string,
): boolean {
  return key.startsWith("skill:")
}
