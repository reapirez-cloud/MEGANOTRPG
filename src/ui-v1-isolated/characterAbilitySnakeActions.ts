import type {
  SnakeAction,
  SnakeEntityRef,
  SnakeSurfaceRequest,
} from "../snake-engine"
import type { CharacterAbilityRow } from "./characterAbilitiesReadModel.ts"

function mechanicalRuleText(
  row: CharacterAbilityRow,
) {
  if (!row.mechanics.length) return ""

  return row.mechanics.map((rule) => {
    const title = rule.label?.trim() || rule.key
    const description = rule.description?.trim() || ""
    const payload =
      rule.mechanic === undefined
        ? ""
        : JSON.stringify(rule.mechanic, null, 2)

    return [
      title,
      description,
      payload ? "Механика:\n" + payload : "",
    ].filter(Boolean).join("\n")
  }).join("\n\n")
}

export function characterAbilityDetailSurface(
  row: CharacterAbilityRow,
): SnakeSurfaceRequest {
  const source = [
    "Источник: " + row.sourceName + ".",
    row.unlockLevel !== null
      ? "Уровень открытия: " + row.unlockLevel + "."
      : "",
    row.status === "suppressed"
      ? "Состояние: заглушено ведущим."
      : "",
  ].filter(Boolean).join("\n")

  const mechanics = mechanicalRuleText(row)
  const voss = [
    row.voss.explanation,
    ...row.voss.nuances,
    row.voss.comment,
  ].filter(Boolean).join("\n\n")

  return {
    kind: "detail",
    eyebrow: row.sourceName,
    title: row.label,
    body: [
      row.shortDescription,
      source,
      mechanics ? "ПРАВИЛО / МЕХАНИКА\n" + mechanics : "",
      voss ? "ВОСС\n" + voss : "",
    ].filter(Boolean).join("\n\n"),
    size: {
      width: "standard",
      height: "tall",
    },
  }
}

export function characterAbilityEntity(
  characterId: string,
  row: CharacterAbilityRow,
): SnakeEntityRef {
  return {
    type: "character-ability",
    id: characterId + ":" + row.id,
  }
}

export function createCharacterAbilitySnakeActions(
  row: CharacterAbilityRow,
): SnakeAction[] {
  return [{
    id: "inspect-character-ability",
    label: "Подробнее",
    surface: characterAbilityDetailSurface(row),
  }]
}
