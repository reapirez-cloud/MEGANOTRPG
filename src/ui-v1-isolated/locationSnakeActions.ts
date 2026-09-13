import type {
  SnakeAction,
  SnakeSurfaceRequest,
} from "../snake-engine"

import type { UiV1Location } from "./useUiV1Locations"

function placeholder(
  title: string,
  body = "Интерфейс этой функции будет спроектирован отдельным этапом.",
): SnakeSurfaceRequest {
  return {
    kind: "placeholder",
    eyebrow: "Локация",
    title,
    body,
  }
}

export function createLocationSnakeActions({
  location,
  canManage,
  onOpen,
}: {
  location: UiV1Location
  canManage: boolean
  onOpen: () => void
}): SnakeAction[] {
  const actions: SnakeAction[] = [
    {
      id: "open",
      label: "Открыть локацию",
      group: "primary",
      execute: () => {
        onOpen()
        return { type: "success" }
      },
    },
  ]

  if (!canManage) return actions

  actions.push(
    {
      id: "add-child",
      label: "Добавить вложенную локацию",
      group: "manage",
      surface: placeholder("Добавление вложенной локации"),
    },
    {
      id: "add-transition",
      label: "Добавить переход",
      group: "manage",
      surface: placeholder("Добавление перехода"),
    },
    {
      id: "edit",
      label: "Редактировать",
      group: "manage",
      surface: placeholder("Редактирование локации"),
    },
    {
      id: "delete",
      label: "Удалить",
      group: "danger",
      tone: "danger",
      surface: placeholder("Удаление локации"),
    },
  )

  return actions
}
