import type {
  CharacterAbilityGroup,
  CharacterAbilityGroupKey,
  CharacterAbilityRow,
} from "./characterAbilitiesReadModel.ts"

export const CHARACTER_ABILITY_PREVIEW_LIMIT = 3

export type CharacterAbilityCollapsedPreview = {
  rows: CharacterAbilityRow[]
  hiddenCount: number
}

export function characterAbilityCollapsedPreview(
  group: CharacterAbilityGroup,
  limit = CHARACTER_ABILITY_PREVIEW_LIMIT,
): CharacterAbilityCollapsedPreview {
  const safeLimit = Math.max(0, Math.floor(limit))
  const rows = group.rows.slice(0, safeLimit)

  return {
    rows,
    hiddenCount: Math.max(0, group.rows.length - rows.length),
  }
}

export function nextExpandedAbilityGroup(
  current: CharacterAbilityGroupKey | null,
  requested: CharacterAbilityGroupKey,
  totalCount: number,
): CharacterAbilityGroupKey | null {
  if (totalCount <= 0) {
    return current === requested ? null : current
  }

  return current === requested ? null : requested
}
