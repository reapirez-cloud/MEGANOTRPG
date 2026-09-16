export type CharacterSheetHistorySection =
  | "overview"
  | "features"
  | "spells"
  | "biography"

export type CharacterSheetHistorySnapshot =
  | {
      characterId: string
      kind: "sheet"
      section: CharacterSheetHistorySection
    }
  | {
      characterId: string
      kind: "interface"
      interface: "inventory"
      returnSection: CharacterSheetHistorySection
      focusedItemId: string | null
    }

const sections: readonly CharacterSheetHistorySection[] = [
  "overview",
  "features",
  "spells",
  "biography",
]

function isSection(value: unknown): value is CharacterSheetHistorySection {
  return typeof value === "string" &&
    sections.includes(value as CharacterSheetHistorySection)
}

export function readCharacterSheetHistory(
  value: unknown,
  characterId: string,
): CharacterSheetHistorySnapshot | null {
  if (!value || typeof value !== "object") return null

  const root = value as Record<string, unknown>
  const raw = root.characterSheet
  if (!raw || typeof raw !== "object") return null

  const state = raw as Record<string, unknown>
  if (state.characterId !== characterId) return null

  if (state.kind === "sheet" && isSection(state.section)) {
    return {
      characterId,
      kind: "sheet",
      section: state.section,
    }
  }

  if (
    state.kind === "interface" &&
    state.interface === "inventory" &&
    isSection(state.returnSection)
  ) {
    return {
      characterId,
      kind: "interface",
      interface: "inventory",
      returnSection: state.returnSection,
      focusedItemId:
        typeof state.focusedItemId === "string"
          ? state.focusedItemId
          : null,
    }
  }

  return null
}

export function characterSheetHistoryStateWith(
  currentHistoryState: unknown,
  snapshot: CharacterSheetHistorySnapshot,
) {
  const base =
    currentHistoryState &&
    typeof currentHistoryState === "object"
      ? { ...(currentHistoryState as Record<string, unknown>) }
      : {}

  return {
    ...base,
    characterSheet: snapshot,
  }
}

export function isCharacterSheetInternalBackTarget(
  snapshot: CharacterSheetHistorySnapshot | null,
) {
  if (!snapshot) return false
  if (snapshot.kind === "interface") return true
  return snapshot.section !== "overview"
}
