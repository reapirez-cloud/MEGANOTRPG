import type {
  SnakeAction,
  SnakeEntityRef,
  SnakeSurfaceRequest,
} from "../snake-engine"
import type {
  CharacterProficiencyRow,
  CharacterProficiencySource,
} from "./characterProficienciesReadModel.ts"

export type CharacterProficiencySuppressionResult = {
  ok: boolean
  error?: string
}

export type CharacterProficiencySnakeContext = {
  canManage: boolean
  setSuppressed?: (
    sourceId: string,
    suppressed: boolean,
  ) => Promise<CharacterProficiencySuppressionResult>
}

function sourceStateText(source: CharacterProficiencySource) {
  if (!source.suppressed) return "активен"
  if (source.directlyManagedSuppressed) return "заглушён ведущим"
  if (source.suppressedBySourceId) {
    return "заглушён родительским источником: " + source.suppressedBySourceId
  }
  return "заглушён"
}

export function characterProficiencyDetailSurface(
  row: CharacterProficiencyRow,
): SnakeSurfaceRequest {
  const sources = row.sources.length
    ? row.sources.map((source) =>
        [
          "• " + source.name,
          "  Тип: " + source.sourceType,
          "  Состояние: " + sourceStateText(source),
        ].join("\n")
      ).join("\n")
    : "Источник не указан."

  return {
    kind: "detail",
    eyebrow: row.status === "suppressed" ? "Заглушено" : "Владение",
    title: row.label,
    body: [
      "Ключ: " + row.key,
      "Ранг: " + (row.rank === 2 ? "Экспертиза" : "Владение"),
      "Состояние: " +
        (row.status === "suppressed"
          ? "механика не применяется"
          : "активно"),
      "ИСТОЧНИКИ\n" + sources,
    ].join("\n\n"),
    size: {
      width: "standard",
      height: "content",
    },
  }
}

function sourceDetailSurface(
  row: CharacterProficiencyRow,
  source: CharacterProficiencySource,
): SnakeSurfaceRequest {
  return {
    kind: "detail",
    eyebrow: row.label,
    title: source.name,
    body: [
      "ID источника: " + source.sourceId,
      source.contributionId
        ? "Contribution: " + source.contributionId
        : "",
      "Тип: " + source.sourceType,
      "Состояние: " + sourceStateText(source),
      source.suppressible
        ? "Источник участвует в Character Engine."
        : "Legacy/read-only источник. Управление через Snake недоступно.",
    ].filter(Boolean).join("\n\n"),
    size: {
      width: "standard",
      height: "content",
    },
  }
}

function sourceControlAction(
  source: CharacterProficiencySource,
  context: CharacterProficiencySnakeContext,
): SnakeAction | null {
  if (!context.canManage || !source.suppressible || !context.setSuppressed) {
    return null
  }

  if (source.suppressed && !source.directlyManagedSuppressed) {
    return {
      id: "inherited-proficiency-source-suppression",
      label: "Отключено родительским источником",
      enabled: false,
      disabledReason:
        "Этот источник подавлен выше по дереву. Включать родительский источник из одного владения небезопасно.",
    }
  }

  const suppress = !source.directlyManagedSuppressed

  return {
    id: suppress
      ? "suppress-proficiency-source"
      : "enable-proficiency-source",
    label: suppress ? "Заглушить источник" : "Включить источник",
    tone: suppress ? "danger" : "normal",
    execute: async () => {
      const result = await context.setSuppressed?.(
        source.sourceId,
        suppress,
      )
      if (!result?.ok) {
        return {
          type: "error",
          message:
            result?.error ||
            "Не удалось изменить состояние источника.",
        }
      }

      return {
        type: "success",
        notice: suppress
          ? "Источник заглушён. Его механика больше не применяется."
          : "Источник включён. Его механика снова применяется.",
      }
    },
  }
}

function sourceBranch(
  row: CharacterProficiencyRow,
  source: CharacterProficiencySource,
  index: number,
  context: CharacterProficiencySnakeContext,
): SnakeAction {
  const control = sourceControlAction(source, context)

  return {
    id: "proficiency-source:" + index + ":" + source.sourceId,
    label:
      source.name +
      (source.suppressed ? " · заглушён" : ""),
    kind: "branch",
    children: [
      {
        id: "inspect-proficiency-source:" + index,
        label: "Подробнее об источнике",
        surface: sourceDetailSurface(row, source),
      },
      ...(control ? [control] : []),
    ],
  }
}

export function characterProficiencyEntity(
  characterId: string,
  row: CharacterProficiencyRow,
): SnakeEntityRef {
  return {
    type: "character-proficiency",
    id: characterId + ":" + row.group + ":" + row.key,
  }
}

export function createCharacterProficiencySnakeActions(
  row: CharacterProficiencyRow,
  context: CharacterProficiencySnakeContext = {
    canManage: false,
  },
): SnakeAction[] {
  const inspect: SnakeAction = {
    id: "inspect-character-proficiency",
    label: "Подробнее",
    surface: characterProficiencyDetailSurface(row),
  }

  const sources: SnakeAction | null = row.sources.length
    ? {
        id: "character-proficiency-sources",
        label:
          row.sources.length === 1
            ? "Источник"
            : "Источники · " + row.sources.length,
        kind: "branch",
        children: row.sources.map((source, index) =>
          sourceBranch(row, source, index, context)
        ),
      }
    : null

  return [
    inspect,
    ...(sources ? [sources] : []),
  ]
}
