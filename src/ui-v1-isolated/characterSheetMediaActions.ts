import type {
  SnakeAction,
  SnakeActionInput,
} from "../snake-engine"
import type {
  MediaPresentationShape,
} from "../media/presentation"
import type {
  UiV1ReferenceMedia,
} from "./useUiV1ReferenceMedia"

type MutationResult = { ok: boolean; error?: string }

export type CharacterSheetMediaController = {
  isOwner: boolean
  get: (targetField: string) => UiV1ReferenceMedia | null
  apply: (
    targetField: string,
    input: SnakeActionInput,
  ) => Promise<MutationResult>
  reset: (targetField: string) => Promise<MutationResult>
}

function mediaItems(
  current: UiV1ReferenceMedia | null,
  title: string,
) {
  if (!current?.url) return []

  return [{
    id: current.assetId,
    src: current.url,
    title,
    facts: {
      assetId: current.assetId,
      storagePath: current.storagePath,
    },
  }]
}

function mutationResult(
  response: MutationResult,
  notice: string,
) {
  return response.ok
    ? { type: "success" as const, notice }
    : {
        type: "error" as const,
        message: response.error || "Не удалось сохранить графику.",
      }
}

export function createSheetReferenceMediaActions({
  controller,
  targetField,
  title,
  eyebrow,
  composeLabel,
  shape,
  aspectRatio,
  applyLabel = "Применить",
  successNotice = "Графика листа обновлена.",
  resetTitle = "Сбросить к встроенной",
  resetNotice = "Встроенная графика восстановлена.",
}: {
  controller: CharacterSheetMediaController
  targetField: string
  title: string
  eyebrow: string
  composeLabel: string
  shape: MediaPresentationShape
  aspectRatio: number
  applyLabel?: string
  successNotice?: string
  resetTitle?: string
  resetNotice?: string
}): SnakeAction[] {
  if (!controller.isOwner) return []

  const current = controller.get(targetField)
  const edit: SnakeAction = {
    id: "edit-media:" + targetField,
    label: current ? "Заменить графику" : "Загрузить графику",
    surface: {
      kind: "media",
      eyebrow,
      title,
      items: mediaItems(current, title),
      compose: {
        label: composeLabel,
        shape,
        aspectRatio,
        allowFilePick: true,
        requireFile: !current,
        fileLabel: current ? "Другое изображение" : "Выбрать изображение",
        submitLabel: applyLabel,
        initialPresentation: current?.presentation || null,
      },
    },
    execute: async ({ input }) =>
      mutationResult(
        await controller.apply(targetField, input),
        successNotice,
      ),
  }

  if (!current) return [edit]

  const reset: SnakeAction = {
    id: "reset-media:" + targetField,
    label: resetTitle,
    tone: "danger",
    surface: {
      kind: "confirm",
      eyebrow,
      title: resetTitle,
      body:
        "Пользовательская замена будет отвязана. Встроенный ассет останется целым и снова станет активным.",
      confirmLabel: "Сбросить",
      cancelLabel: "Отмена",
    },
    execute: async ({ input }) => {
      if (input?.confirmed !== true) {
        return { type: "error" as const, message: "Сброс не подтверждён." }
      }
      return mutationResult(
        await controller.reset(targetField),
        resetNotice,
      )
    },
  }

  return [edit, reset]
}
