import type {
  SnakeAction,
  SnakeEntityRef,
  SnakeSurfaceRequest,
} from "../snake-engine"
import type { CharacterAbilityRow } from "./characterAbilitiesReadModel.ts"

export type CharacterAbilitySuppressionResult = {
  ok: boolean
  error?: string
}

export type CharacterAbilitySnakeActionContext = {
  canManage: boolean
  setSuppressed?: (
    sourceId: string,
    suppressed: boolean,
  ) => Promise<CharacterAbilitySuppressionResult>
}

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

function managerSuppressionAction(
  row: CharacterAbilityRow,
  context: CharacterAbilitySnakeActionContext,
): SnakeAction | null {
  if (
    !context.canManage ||
    !row.capabilities.suppress ||
    !row.sourceId ||
    !context.setSuppressed
  ) {
    return null
  }

  const suppress = row.status !== "suppressed"

  return {
    id: suppress
      ? "suppress-character-ability"
      : "enable-character-ability",
    label: suppress ? "Заглушить" : "Включить",
    tone: suppress ? "danger" : "normal",
    execute: async () => {
      const result = await context.setSuppressed?.(
        row.sourceId as string,
        suppress,
      )

      if (!result?.ok) {
        return {
          type: "error",
          message:
            result?.error ||
            "Не удалось изменить состояние умения.",
        }
      }

      return {
        type: "success",
        notice: suppress
          ? "Умение заглушено. Его механика больше не применяется."
          : "Умение включено. Его механика снова применяется.",
      }
    },
  }
}

export function createCharacterAbilitySnakeActions(
  row: CharacterAbilityRow,
  context: CharacterAbilitySnakeActionContext = {
    canManage: false,
  },
): SnakeAction[] {
  const inspect: SnakeAction = {
    id: "inspect-character-ability",
    label: "Подробнее",
    surface: characterAbilityDetailSurface(row),
  }
  const managerAction = managerSuppressionAction(row, context)

  return [
    inspect,
    ...(managerAction ? [managerAction] : []),
  ]
}
